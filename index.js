// Require the necessary discord.js classes
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
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
    const channel = client.channels.cache.get('1227711111227506791');

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


// Login to Discord with your app's token
client.login(process.env.TOKEN);
let pot = [];
let potTotal = 0;
let joinedUsers = new Set();

// Event listener for when a message is sent in a server
client.on('messageCreate', async message => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Check if the user is an admin
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // Command handling
    const args = message.content.split(' ');
    const command = args[0];

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
        try {
            const statusList = await onlineOnlineStatus();
            message.channel.send({ embeds: [statusList] });
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    } else if (command === '!all') {
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

        if (subCommand === 'join') {
            // Check if the user has already joined
            if (joinedUsers.has(message.author.id)) {
                message.channel.send('You have already joined the lottery.');
                return;
            }

            const amountString = args[2];

            if (!amountString || !amountString.endsWith('m')) {
                message.channel.send('Please specify a valid amount in millions (e.g., 10m).');
                return;
            }

            const amount = parseInt(amountString.slice(0, -1));
            if (isNaN(amount) || amount <= 0 || amount > 9999) {
                message.channel.send('Please specify a valid amount in millions between 1 and 9999 (e.g., 10m).');
                return;
            }

            const user = message.author;

            // Add the user to the set of joined users
            joinedUsers.add(user.id);

            // Add the user to the pot
            pot.push({ user, amount });
            potTotal += amount;

            // Calculate the pot shares
            const shares = pot.map(entry => {
                const percentage = ((entry.amount / potTotal) * 100).toFixed(2);
                return `<@${entry.user.id}> ${percentage}% of pot`;
            }).join(', ');

            // Announce the user's entry
            message.channel.send(`You joined the pot with ${amount}m! (${shares})`);
        } else if (subCommand === 'start') {
            if (!isAdmin) {
                message.channel.send('You do not have permission to use this command.');
                return;
            }
            
            // Reset the set of joined users after starting the lottery
            joinedUsers = new Set();

            if (pot.length === 0) {
                message.channel.send('No one has joined the pot yet!');
                return;
            }
        
            // Pick a random winner
            const winnerIndex = Math.floor(Math.random() * pot.length);
            const winner = pot[winnerIndex];
            const totalPot = potTotal;
        
            // Remove the winner from the pot
            pot.splice(winnerIndex, 1);
            potTotal -= winner.amount;
        
            // Announce the winner
            const loserMessage = pot.map(entry => `<@${entry.user.id}> owes ${entry.amount}m`).join(', ');
            message.channel.send(`<@${winner.user.id}> wins ${totalPot}m pot with a ${((winner.amount / totalPot) * 100).toFixed(2)}% chance! ${loserMessage}.`);

            // Reset the pot
            pot = [];
            potTotal = 0;
        } else if (subCommand === 'list') {
            if (pot.length === 0) {
                message.channel.send('No one has joined the pot yet!');
                return;
            }

            const shares = pot.map(entry => {
                const percentage = ((entry.amount / potTotal) * 100).toFixed(2);
                return `<@${entry.user.id}> (${percentage}% of pot)`;
            }).join(', ');

            message.channel.send(`Current pot amount: **${potTotal}m**\nPlayers and their shares: ${shares}`);
        } else {
            message.channel.send('To join the pot, type `!lottery join <amount>`. To start the game, type `!lottery start`. To list the current pot, type `!lottery list`.');
        }
    }
});

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
    const url = `https://api.hypixel.net/v2/status?uuid=${uuid}&key=1db6a125-8692-4497-b1e0-655e1930bba9`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.session.online;
}