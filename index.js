// Require the necessary discord.js classes
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const puppeteer = require('puppeteer');
const { EmbedBuilder } = require('discord.js');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// MongoDB connection
let db;
async function connectToMongoDB() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db('discordBotDB'); // use your desired database name
    console.log('Connected to MongoDB');
}

client.once('ready', async () => {
    console.log('Ready!');
    await connectToMongoDB();
});

let intervalId; // Variable to hold the interval ID

async function getItemsFromDatabase() {
    const collection = db.collection('scrapedItems');
    const items = await collection.find().toArray();
    return items.map(item => item.name);
}

async function getLastSentTime(itemName) {
    const collection = db.collection('sentItems');
    const item = await collection.findOne({ name: itemName });
    return item ? item.lastSent : null;
}

async function updateLastSentTime(itemName) {
    const collection = db.collection('sentItems');
    await collection.updateOne(
        { name: itemName },
        { $set: { lastSent: new Date() } },
        { upsert: true }
    );
}

async function scrapeAndSend() {
    const itemsToScrape = await getItemsFromDatabase();
    const itemsData = await scrapeManipulate(itemsToScrape);
    const channel = client.channels.cache.get('1246898104783863919');

    // Filter items with risk value less than 150,000,000 and not sent in the last 3 hours
    const filteredItems = [];
    const currentTime = new Date();

    for (const itemData of itemsData) {
        const riskValue = parseFloat(itemData.partial.risk.replace(/,/g, ''));
        if (isNaN(riskValue) || riskValue >= 150000000) {
            continue;
        }

        const lastSentTime = await getLastSentTime(itemData.itemName);
        if (lastSentTime) {
            const oneHourAgo = new Date(currentTime.getTime() - 1 * 60 * 60 * 1000);
            if (new Date(lastSentTime) > oneHourAgo) {
                continue;
            }
        }

        filteredItems.push(itemData);
    }

    if (filteredItems.length > 0) {
        const embeds = filteredItems.map(({ itemName, imageUrl, partial }) => {
            return new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle(`**Risk for *${itemName}***`)
                .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                .setDescription('This item is listed on the manipulate site. <@&684591246144176189>') // <@&1243785958600736778>
                .setThumbnail(imageUrl)
                .addFields(
                    { name: 'Buyout Price', value: `${partial.buyoutPrice}`, inline: false },
                    { name: 'Average Buy Price', value: `${partial.averageBuyPrice}`, inline: false },
                    { name: 'Amount of Items', value: `${partial.amountOfItems}`, inline: false },
                    { name: 'Post-Buyout Price', value: `${partial.postBuyoutPrice}`, inline: false },
                    { name: 'Risk', value: `${partial.risk}`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
        });

        if (embeds.length > 10) {
            // Discord has a limit of 10 embeds per message, so we'll send multiple messages if needed
            for (let i = 0; i < embeds.length; i += 10) {
                const embedBatch = embeds.slice(i, i + 10);
                await channel.send({ embeds: embedBatch });
            }
        } else {
            await channel.send({ embeds });
        }

        // Update the last sent time for each item
        for (const itemData of filteredItems) {
            await updateLastSentTime(itemData.itemName);
        }
    }
}

async function scrapeManipulate(items) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://www.skyblock.bz/manipulate', { waitUntil: 'networkidle2', timeout: 90000 });

    const itemsData = await page.evaluate((items) => {
        const cards = document.querySelectorAll('div.card.svelte-1crwetk');
        const scrapedItems = [];

        cards.forEach(card => {
            const itemNameElement = card.querySelector('div.item-name.svelte-1crwetk');
            const itemName = itemNameElement ? itemNameElement.textContent.trim() : '';

            if (items.includes(itemName)) {
                const partialData = {};
                const imageElement = card.querySelector('img');
                const imageUrl = imageElement ? imageElement.src : '';

                const partialSection = card.querySelector('p.card_menu.svelte-1crwetk');
                if (partialSection) {
                    const partialElements = partialSection.innerHTML.split('<br>');

                    partialElements.forEach((element, index) => {
                        if (element.includes('Partial')) {
                            partialData.buyoutPrice = partialElements[index + 1]?.split(':')[1]?.trim() || 'N/A';
                            partialData.averageBuyPrice = partialElements[index + 2]?.split(':')[1]?.trim() || 'N/A';
                            partialData.amountOfItems = partialElements[index + 3]?.split(':')[1]?.trim() || 'N/A';
                            partialData.postBuyoutPrice = partialElements[index + 4]?.split(':')[1]?.trim() || 'N/A';
                            partialData.risk = partialElements[index + 5]?.split(':')[1]?.trim() || 'N/A';
                        }
                    });
                }

                scrapedItems.push({
                    itemName,
                    imageUrl,
                    partial: partialData
                });
            }
        });

        return scrapedItems;
    }, items);

    await browser.close();
    return itemsData;
}

/*  ------------------------------     RIGGER FOR !CF     ------------------------------
// Determine the result, giving preference to EOMS's choice if specified
        let result;
        if (eomsPreferredOutcome) {
            result = eomsPreferredOutcome;
        } else {
            result = Math.random() < 0.5 ? 'heads' : 'tails';
        }

        // Define the GIFs for heads and tails
        const gifUrl = result === 'heads' ? 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402013274505266/Heads.gif?ex=6654fb2f&is=6653a9af&hm=7b882c7c79aa6915c03611dea0de30e5eba0086f451da73d3bd9603bc17c459f&' : 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402012859138118/Tails.gif?ex=6654fb2f&is=6653a9af&hm=27814c24d3f02a3dd8fbe8f488a289ee8a569875063d194ee406860bd1c5046e&';

        // Send the embed with the GIF
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setDescription('Flipping the coin...')
            .setImage(gifUrl)
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

        message.channel.send({ embeds: [embed] });

        // Wait for 4 seconds before revealing the result
        setTimeout(() => {
            const resultEmbed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`The coin landed on ${result}!`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [resultEmbed] });

            // Reset the preferred outcome after the flip
            eomsPreferredOutcome = null;
        }, 4000);



//  -------------------------    NORMAL    ------------------------------
// Randomly choose between heads and tails
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        
        // Define the GIFs for heads and tails
        const gifUrl = result === 'heads' ? 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402013274505266/Heads.gif?ex=6654fb2f&is=6653a9af&hm=7b882c7c79aa6915c03611dea0de30e5eba0086f451da73d3bd9603bc17c459f&' : 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402012859138118/Tails.gif?ex=6654fb2f&is=6653a9af&hm=27814c24d3f02a3dd8fbe8f488a289ee8a569875063d194ee406860bd1c5046e&';

        // Send the embed with the GIF
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setDescription('Flipping the coin...')
            .setImage(gifUrl)
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
        
        // Send the embed
        message.channel.send({ embeds: [embed] });

        // Wait for 3 seconds before revealing the result
        setTimeout(() => {
            const resultEmbed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`The coin landed on ${result}!`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [resultEmbed] });
        }, 4000);

*/


// Login to Discord with your app's token
client.login(process.env.TOKEN);
let pot = [];
let potTotal = 0;
let middleMan = null; // Variable to store the middle man
let joinedUsers = new Set();
let lotteryActive = false; // State variable to track if the lottery is active

const EOMS_USER_ID = '684591246144176189';
let eomsPreferredOutcome = null;

const deck = [
    '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
    '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
    '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
    '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
];

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function calculateHandValue(hand) {
    let sum = 0;
    let aceCount = 0;
    for (const card of hand) {
        if (card === 'A') {
            aceCount++;
            sum += 11;
        } else if (['J', 'Q', 'K'].includes(card)) {
            sum += 10;
        } else {
            sum += parseInt(card);
        }
    }
    while (sum > 21 && aceCount > 0) {
        sum -= 10;
        aceCount--;
    }
    return sum;
}

function dealCard() {
    return deck.pop();
}

// Event listener for when a message is sent in a server
client.on('messageCreate', async message => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Check if the user is an admin
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // Command handling
    const args = message.content.split(' ');
    const command = args[0];

    if (message.author.id === EOMS_USER_ID) {
        if (message.content.toLowerCase() === 'i got heads') {
            eomsPreferredOutcome = 'heads';
            console.log('Your next coin flip will be heads!');
        } else if (message.content.toLowerCase() === 'i got tails') {
            eomsPreferredOutcome = 'tails';
            console.log('Your next coin flip will be tails!');
        }
    }

    if (command === '!add') {
        if (!isAdmin) {
            message.channel.send('**🔴 You do not have permission to use this command.**');
            return;
        }

        const username = args[1];
        if (!username) {
            message.channel.send('**🟠 Please provide a username.**');
            return;
        }
        try {
            await addUser(username);
            message.channel.send(`**User ${username} added to the database.**`);
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error adding the user.**');
        }
    } else if (command === '!delete') {
        if (!isAdmin) {
            message.channel.send('You do not have permission to use this command.');
            return;
        }

        const username = args[1];
        if (!username) {
            message.channel.send('Please provide a username.');
            return;
        }
        try {
            await deleteUser(username);
            message.channel.send(`User ${username} deleted from the database.`);
        } catch (error) {
            console.error(error);
            message.channel.send('There was an error deleting the user.');
        }
    } else if (command === '!check') {
        if (!isAdmin) {
            message.channel.send('You do not have permission to use this command.');
            return;
        }

        try {
            const statusList = await onlineOnlineStatus();
            message.channel.send({ embeds: [statusList] });
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    } else if (command === '!all') {
        if (!isAdmin) {
            message.channel.send('You do not have permission to use this command.');
            return;
        }

        try {
            const embed = await checkOnlineStatus();
            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    } else if (command === '!risk') {
        // Start/Stop interval logic
        const action = args[1];
        if (action === 'start') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }

            if (!intervalId) {
                intervalId = setInterval(scrapeAndSend, 2 * 60 * 1000); // Start the interval
                message.channel.send('Risk notifications interval started.');
            } else {
                message.channel.send('Risk notifications interval is already running.');
            }
        } else if (action === 'stop') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }

            if (intervalId) {
                clearInterval(intervalId); // Stop the interval
                intervalId = null;
                message.channel.send('Risk notifications interval stopped.');
            } else {
                message.channel.send('Risk notifications interval is not running.');
            }
        }  else if (action === 'add') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }

            const itemName = args.slice(2).join(' '); // Combine all arguments after the command and action into one string as the item name
            if (!itemName) {
                message.channel.send('Please provide an item name to add.');
                return;
            }
    
            try {
                await addItemToDatabase(itemName);
                message.channel.send(`Item "${itemName}" added to the database.`);
            } catch (error) {
                console.error(error);
                message.channel.send('There was an error adding the item to the database.');
            }
        } else if (action === 'delete') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }

            const itemName = args.slice(2).join(' '); // Combine all arguments after the command and action into one string as the item name
            if (!itemName) {
                message.channel.send('Please provide an item name to delete.');
                return;
            }
    
            try {
                await deleteItemFromDatabase(itemName);
                message.channel.send(`Item "${itemName}" deleted from the database.`);
            } catch (error) {
                console.error(error);
                message.channel.send('There was an error deleting the item from the database.');
            } 
        } else if (action === 'list') {
                try {
                    const itemsList = await listItemsFromDatabase();
                    message.channel.send(`Items in the database: ${itemsList.join(', ')}`);
                } catch (error) {
                    console.error('Error listing items from the database:', error);
                    message.channel.send('Error listing items from the database.');
                }
        } else {
            message.channel.send('Invalid action. Use `start` or `stop`.');
        }
    } else if (command === '!bzmhelp') {
        const embed = new EmbedBuilder()
        .setColor(0xA91313)
        .setTitle('Commands')
        .addFields(
            { name: '!risk start/stop', value: `Start/stop the risk (Admin only)`, inline: false },
            { name: '!risk add [item]', value: `Add items to the risk command (Admin only)`, inline: false },
            { name: '!risk delete [item]', value: `Delete items from the risk command (Admin only)`, inline: false },
            { name: '!risk list', value: `Lists items for the risk command`, inline: false },
            { name: '!check', value: `Check for online griefers`, inline: false },
            { name: '!all', value: `Check for all griefers`, inline: false },
            { name: '!add [player]', value: `Add a griefer (Admin only)`, inline: false },
            { name: '!delete [player]', value: `Delete a griefer (Admin only)`, inline: false },
            { name: '!visit', value: `Top 10 most visited items`, inline: false },
            { name: '!lottery create', value: `Creates a lottery`, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

        message.channel.send({ embeds: [embed] });
    } else if (command === '!visit') {
        if (!isAdmin) {
            message.channel.send('You do not have permission to use this command.');
            return;
        }

        try {
            const embeds = await scrapeTopItems();
            await message.channel.send({ embeds: embeds });
        } catch (error) {
            console.error('Error retrieving top items:', error);
            message.channel.send('**🔴 There was an error retrieving the top items.**');
        }
    } else if (command === '!lottery') {
        const subCommand = args[1];

        if (subCommand === 'create') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }

            lotteryActive = true;
            pot = [];
            potTotal = 0;
            joinedUsers = new Set();

            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription('A new lottery has been created! You can now join the lottery using `!lottery join`.')
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [embed] });
        } else if (subCommand === 'join') {
            const subCommand = args[1];

            if (subCommand === 'join') {
                // Check if the user has already joined
                if (!lotteryActive) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('The lottery has not been created yet.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                    return;
                }

                if (joinedUsers.has(message.author.id)) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('You have already joined the lottery.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                    return;
                }

                const amountString = args[2];

                if (!amountString || !amountString.endsWith('m')) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('Please specify a valid amount in millions (e.g., 10m).')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                    return;
                }

                const amount = parseInt(amountString.slice(0, -1));
                if (isNaN(amount) || amount <= 0 || amount > 9999) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('Please specify a valid amount in millions between 1 and 9999 (e.g., 10m).')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                    return;
                }

                const user = message.author;

                // Add the user to the set of joined users
                joinedUsers.add(user.id);

                // Add the user to the pot
                pot.push({ user, amount, paid: false });
                potTotal += amount;

                // Calculate the pot shares
                const shares = pot.map(entry => {
                    const percentage = ((entry.amount / potTotal) * 100).toFixed(2);
                    return `${entry.user.username} ${percentage}% of pot`;
                }).join(', ');

                // Announce the user's entry
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription(`You joined the pot with ${amount}m! (${shares})`)
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
                }

        } else if (subCommand === 'start') {
            if (!isAdmin) {
                message.channel.send('**🔴 You do not have permission to use this command.**');
                return;
            }

            if (pot.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('No one has joined the pot yet!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
                return;
            }
            
            // Calculate the total weight
            let totalWeight = pot.reduce((sum, entry) => sum + entry.amount, 0);
            
            // Pick a random winner based on weights
            let random = Math.random() * totalWeight;
            let winner;
            for (const entry of pot) {
                if (random < entry.amount) {
                    winner = entry;
                    break;
                }
                random -= entry.amount;
            }
            
            const totalPot = potTotal;
            
            // Remove the winner from the pot
            const winnerIndex = pot.indexOf(winner);
            pot.splice(winnerIndex, 1);
            potTotal -= winner.amount;
            
            // Announce the winner
            const loserMessage = pot.map(entry => `<@${entry.user.id}> owes ${entry.amount}m`).join(', ');
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`<@${winner.user.id}> wins ${totalPot}m pot with a ${(winner.amount / totalPot * 100).toFixed(2)}% chance! ${loserMessage}.`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [embed] });
            
            // Reset the pot
            pot = [];
            potTotal = 0;
            lotteryActive = false;
        } else if (subCommand === 'list') {
            if (pot.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('No one has joined the pot yet!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
                return;
            }
        
            const shares = pot.map(entry => {
                const percentage = ((entry.amount / potTotal) * 100).toFixed(2);
                return `**\n${entry.user.username}** (${entry.amount}m, ${percentage}% of pot${entry.paid ? ', **PAID**' : ''})`;
            }).join(', ');
        
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`Current pot amount: **${potTotal}m**\n\nPlayers and their shares: ${shares}`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [embed] });
        } else if (subCommand === 'leave') {
            const userIndex = pot.findIndex(entry => entry.user.id === message.author.id);
            if (userIndex !== -1) {
                const removedUser = pot.splice(userIndex, 1)[0];
                potTotal -= removedUser.amount;
                joinedUsers.delete(message.author.id);
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription(`You have been removed from the pot. Your contribution of ${removedUser.amount}m has been refunded.`)
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('You are not in the pot.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            }
        } else if (subCommand === 'mm') {
            const mmCommand = args[2];

            if (mmCommand === 'set') {
                const mentionedUser = message.mentions.users.first();
                if (!mentionedUser) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('Please mention a user to set as the middle man.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                    return;
                }

                middleMan = mentionedUser;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription(`Middle man set to <@${mentionedUser.id}>.`)
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            } else if (mmCommand === 'get') {
                if (!middleMan) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('No middle man is currently set.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription(`Current middle man: <@${middleMan.id}>.`)
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    message.channel.send({ embeds: [embed] });
                }
            } else if (mmCommand === 'remove') {
                middleMan = null;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Middle man removed.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Invalid mm command. Use `set`, `get`, or `remove`.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            }
        } else if (subCommand === 'paid') {
            if (!message.member.permissions.has('ADMINISTRATOR')) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('You do not have permission to mark users as paid.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
                return;
            }
        
            const mentionedUser = message.mentions.users.first();
            if (!mentionedUser) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Please mention a user to mark as paid.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
                return;
            }
        
            const userInPot = pot.find(entry => entry.user.id === mentionedUser.id);
            if (userInPot) {
                userInPot.paid = true;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Alright!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('This user is not in the pot.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                message.channel.send({ embeds: [embed] });
            }
        }
    } else if (command === '!cf') {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        
        // Define the GIFs for heads and tails
        const gifUrl = result === 'heads' ? 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402013274505266/Heads.gif?ex=6654fb2f&is=6653a9af&hm=7b882c7c79aa6915c03611dea0de30e5eba0086f451da73d3bd9603bc17c459f&' : 'https://cdn.discordapp.com/attachments/1242245497172004976/1244402012859138118/Tails.gif?ex=6654fb2f&is=6653a9af&hm=27814c24d3f02a3dd8fbe8f488a289ee8a569875063d194ee406860bd1c5046e&';

        // Send the embed with the GIF
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setDescription('Flipping the coin...')
            .setImage(gifUrl)
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
        
        // Send the embed
        message.channel.send({ embeds: [embed] });

        // Wait for 3 seconds before revealing the result
        setTimeout(() => {
            const resultEmbed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`The coin landed on ${result}!`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            message.channel.send({ embeds: [resultEmbed] });
        }, 4000);
    } else if (command ==='!godroll') {
        try {
            const items = await getItemsFromDatabase();

            // Scrape and get the risk values for all items
            const itemsData = await scrapeManipulate(items);

            // Filter out items without valid risk values and sort by risk (ascending)
            const sortedItems = itemsData
                .filter(item => {
                    const riskValue = parseFloat(item.partial.risk.replace(/,/g, ''));
                    return !isNaN(riskValue);
                })
                .sort((a, b) => parseFloat(a.partial.risk.replace(/,/g, '')) - parseFloat(b.partial.risk.replace(/,/g, '')));

            if (sortedItems.length === 0) {
                message.channel.send('No items found with valid risk values.');
                return;
            }

            // Construct the message with sorted items
            const sortedItemsList = sortedItems.map(item => `${item.itemName}: ${item.partial.risk}`).join('\n');

            // Send the sorted list to the channel
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle('Sorted Items by Risk (Low to High)')
                .setDescription(sortedItemsList)
                .setTimestamp()
                .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching and sorting items:', error);
            message.channel.send('There was an error fetching and sorting items by risk.');
        }
    } else if (command === '!ticketcreate') {
        if (!isAdmin) {
            message.channel.send('You do not have permission to use this command.');
            return;
        }
    
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('🎖️ Bazaar Maniac Supports')
            .setDescription(`🎯 Welcome to supports!
    Select an option below to get started!
    
    ✨ Manipulation help - We are trying to help the new player trying to manipulate, but don't ask "how do I get started". Manipulation help is for solving a specific problem.
    
    🎀 Giveaway Redeems - Won a giveaway? Make a ticket to claim!
    
    🏆 Griefer Reports - Report any griefer that's griefing your manipulation here, so we have a better understanding of their timezone, ability to log on, etc.
    
    ⌛ You Can Expect Instant Response Times From 03:00 PM EST to 11:00 PM EST
    
    🎫 Type !ticket to create a ticket!`);
    
        message.channel.send({ embeds: [embed] });
    } else if (command === '!ticket') {
        const allowedChannelId = '1240475372034982010';
    
        // Check if the command is used in the specified channel
        if (message.channel.id !== allowedChannelId) {
            message.channel.send('You can only use this command in the specified channel.');
            return;
        }
    
        // Delete the user's command message
        message.delete().catch(console.error);
    
        const categoryName = 'Tickets';
        const categoryChannel = message.guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
    
        if (!categoryChannel) {
            message.channel.send(`Tickets category "${categoryName}" does not exist.`);
            console.error(`Tickets category "${categoryName}" does not exist.`);
            console.log(message.guild.channels.cache.map(c => c.name)); // Log all channel names for debugging
            return;
        }
    
        message.guild.channels.create({
            name: `ticket-${message.author.username}`,
            type: ChannelType.GuildText,
            parent: categoryChannel.id,
            permissionOverwrites: [
                {
                    id: message.guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: message.author.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: '1227670431150903297', // Replace with your actual admin role ID
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ],
        }).then(channel => {
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`🏆 Support will be with you shortly. Please fill out the information below:
                
                **Ign**:
                **Issue**:
                **Timezone**:
                
                You can close the ticket with \`!close\`.`);
            
            channel.send({ content: `<@${message.author.id}> Thanks for opening a ticket!`, embeds: [embed] });
        }).catch(err => {
            console.error(err);
            message.channel.send('There was an error creating your ticket.');
        });
    } else if (command === '!close') {
        if (message.channel.name.startsWith('ticket-')) {
            message.channel.delete()
                .then(() => console.log(`Deleted channel ${message.channel.name}`))
                .catch(console.error);
        } else {
            message.channel.send('This command can only be used in a ticket channel.');
        }
    }
    /*else if (command === '!blackjack') {
        // Check if the user is an admin
        if (!isAdmin) {
            message.channel.send('**🔴 Only admins can start a blackjack game.**');
            return;
        }

        // Check if there are enough players
        if (args.length < 3) {
            message.channel.send('**🟠 Please mention at least two players to start a blackjack game.**');
            return;
        }

        // Shuffle deck and deal cards
        shuffleDeck();
        const dealerId = message.author.id;
        const playerHands = {};
        const players = [];

        // Add players to the game
        for (let i = 1; i < args.length; i++) {
            const playerId = args[i].replace(/[<@!>]/g, ''); // Remove mention formatting
            players.push(playerId);
            playerHands[playerId] = [dealCard(), dealCard()];
        }

        // Initialize dealer's hand
        playerHands[dealerId] = [dealCard(), dealCard()];

        // Display initial game state
        const embedBuilder = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Blackjack Game')
            .setDescription('React with ✋ to hit or 🛑 to stand.')
            .addField('Dealer\'s Hand', `${playerHands[dealerId][0]}, ?`, true);

        players.forEach((playerId, index) => {
            embedBuilder.addField(`Player ${index + 1}'s Hand`, playerHands[playerId].join(', '), true);
        });

        embedBuilder
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

        const gameMessage = await message.channel.send({ embeds: [embedBuilder] });

        await gameMessage.react('✋');
        await gameMessage.react('🛑');

        // Function to update game state and check for win/lose conditions
        const updateGameState = async () => {
            // Calculate dealer's total
            const dealerTotal = calculateHandValue(playerHands[dealerId]);

            // Check if dealer busts
            if (dealerTotal > 21) {
                message.channel.send(`<@${dealerId}> Dealer busts! Players win!`);
                return;
            }

            // Iterate through each player and check their total
            for (const playerId of players) {
                const playerTotal = calculateHandValue(playerHands[playerId]);
                const player = message.guild.members.cache.get(playerId);

                // Check if player busts
                if (playerTotal > 21) {
                    message.channel.send(`<@${playerId}> Bust! Dealer wins.`);
                    continue;
                }

                // Compare player's total with dealer's total
                if (playerTotal > dealerTotal) {
                    message.channel.send(`<@${playerId}> wins against the dealer!`);
                } else if (playerTotal < dealerTotal) {
                    message.channel.send(`<@${playerId}> loses against the dealer.`);
                } else {
                    message.channel.send(`<@${playerId}> It's a tie with the dealer!`);
                }
            }
        };

        // Handle reactions
        const collectorFilter = (reaction, user) => {
            return ['✋', '🛑'].includes(reaction.emoji.name) && players.includes(user.id);
        };

        const collector = gameMessage.createReactionCollector({ filter: collectorFilter, time: 30000 });

        collector.on('collect', async (reaction, user) => {
            const playerId = user.id;

            // Handle hit
            if (reaction.emoji.name === '✋') {
                playerHands[playerId].push(dealCard());

                // Update game state
                const playerEmbed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setTitle('Blackjack Game')
                    .setDescription('React with ✋ to hit or 🛑 to stand.');

                // Update dealer's hand
                playerEmbed.addField('Dealer\'s Hand', `${playerHands[dealerId][0]}, ?`, true);

                // Update players' hands
                players.forEach((playerId, index) => {
                    playerEmbed.addField(`Player ${index + 1}'s Hand`, playerHands[playerId].join(', '), true);
                });

                playerEmbed
                    .setTimestamp()
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

                await gameMessage.edit({ embeds: [playerEmbed] });

                // Check if player busts
                if (calculateHandValue(playerHands[playerId]) > 21) {
                    message.channel.send(`<@${playerId}> Bust!`);
                }
            }

            // Handle stand
            if (reaction.emoji.name === '🛑') {
                await updateGameState();
                collector.stop();
            }
        });
    }*/

    // Check if the message is in the specified channel and delete it
    const allowedChannelId = '1240475372034982010';
    if (message.channel.id === allowedChannelId && !message.author.bot) {
        message.delete().catch(console.error);
    }
});

async function getPartialStats(item) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://www.skyblock.bz/manipulate', { waitUntil: 'networkidle2', timeout: 90000 });

    const partialStats = await page.evaluate((item) => {
        const cards = document.querySelectorAll('div.card.svelte-1crwetk');
        
        for (let card of cards) {
            const itemNameElement = card.querySelector('div.item-name.svelte-1crwetk');
            const itemName = itemNameElement ? itemNameElement.textContent.trim() : '';

            if (itemName.toLowerCase() === item.toLowerCase()) {
                const partialData = {};
                const partialSection = card.querySelector('p.card_menu.svelte-1crwetk');
                
                if (partialSection) {
                    const partialElements = partialSection.innerHTML.split('<br>');

                    partialElements.forEach((element, index) => {
                        if (element.includes('Partial')) {
                            partialData.buyoutPrice = partialElements[index + 1]?.split(':')[1]?.trim() || 'N/A';
                            partialData.averageBuyPrice = partialElements[index + 2]?.split(':')[1]?.trim() || 'N/A';
                            partialData.amountOfItems = partialElements[index + 3]?.split(':')[1]?.trim() || 'N/A';
                            partialData.postBuyoutPrice = partialElements[index + 4]?.split(':')[1]?.trim() || 'N/A';
                            partialData.risk = partialElements[index + 5]?.split(':')[1]?.trim() || 'N/A';
                        }
                    });
                }

                return partialData;
            }
        }

        return null;
    }, item);

    await browser.close();
    return partialStats;
}

async function scrapeTopItems() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://www.skyblock.bz/all', { waitUntil: 'networkidle2', timeout: 90000 });

    const topItems = await page.evaluate(() => {
        const cards = document.querySelectorAll('div.card.svelte-1crwetk');
        const scrapedItems = [];

        cards.forEach((card, index) => {
            if (index >= 11) return; // Get only the top 10 items

            const itemNameElement = card.querySelector('div.item-name.svelte-1crwetk');
            const itemName = itemNameElement ? itemNameElement.textContent.trim() : '';

            const imageElement = card.querySelector('img');
            const imageUrl = imageElement ? imageElement.src : '';

            if (itemName) {
                scrapedItems.push({
                    itemName,
                    imageUrl
                });
            }
        });

        return scrapedItems;
    });

    await browser.close();

    const embeds = topItems.map((item, index) => {
        return new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle(`#${index + 1}: ${item.itemName}`)
            .setThumbnail(item.imageUrl)
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
    });

    return embeds;
}

async function listItemsFromDatabase() {
    try {
        await connectToMongoDB();
        const collection = db.collection('scrapedItems');
        const items = await collection.find().toArray();
        return items.map(item => item.name);
    } catch (error) {
        console.error('Error listing items from the database:', error);
        throw error;
    }
}

async function addItemToDatabase(itemName) {
    const collection = db.collection('scrapedItems');
    await collection.insertOne({ name: itemName });
}

async function deleteItemFromDatabase(itemName) {
    const collection = db.collection('scrapedItems');
    await collection.deleteOne({ name: itemName });
}

async function getUUID(username) {
    const url = `https://api.mojang.com/users/profiles/minecraft/${username}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.id; // This is the UUID of the user
}

async function addUser(username) {
    const uuid = await getUUID(username);
    const collection = db.collection('users');
    await collection.updateOne(
        { uuid },
        { $set: { username } },
        { upsert: true }
    );
}

async function deleteUser(username) {
    const uuid = await getUUID(username);
    const collection = db.collection('users');
    await collection.deleteOne({ uuid });
}

async function checkOnlineStatus() {
    const collection = db.collection('users');
    const users = await collection.find().toArray();
    let statusList = '';
    let onlineCount = 0;
    const totalCount = users.length;

    for (const user of users) {
        const status = await online(user.uuid);
        statusList += `${user.username} ${status ? '🟢' : '🔴'}\n`;
        if (status) onlineCount++;
    }

    const embed = new EmbedBuilder()
        .setColor(0xA91313)
        .setTitle('Griefers Online Status')
        .setDescription(`**Online Griefers: (${onlineCount}/${totalCount})**\n${statusList}`)
        .setTimestamp()
        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

    return embed;
}

async function onlineOnlineStatus() {
    const collection = db.collection('users');
    const users = await collection.find().toArray();
    let onlineUsers = [];
    let onlineCount = 0;
    const totalCount = users.length;

    for (const user of users) {
        const status = await online(user.uuid);
        if (status) {
            onlineUsers.push(user.username);
            onlineCount++;
        }
    }

    const statusList = onlineUsers.length > 0 ? onlineUsers.map(username => `${username} 🟢`).join('\n') : 'No users online.';

    const statusEmbed = new EmbedBuilder()
        .setColor(0xA91313)
        .setTitle('Online Griefers')
        .addFields({ name: `**Online Griefers:** (${onlineCount}/${totalCount})\n`, value: statusList })
        .setTimestamp()
        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

    return statusEmbed;
}

async function online(uuid) {
    const url = `https://api.hypixel.net/v2/status?uuid=${uuid}&key=58f3bf6b-af9c-42ac-b7dd-a281263fbc86`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.session.online;
}