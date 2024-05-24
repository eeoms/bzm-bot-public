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

const itemsToScrape = [
    'Compost', 'Essence Crimson', 'Essence Wither', 'Squash', 'Toxic Arrow Poison', 'Enchanted Slime Ball', 'Slime Ball',
    'Enchanted Slime Block', 'Sorrow', 'Enchanted Leather', 'Jungle Key', 'Dungeon Chest Key', 'Giant Fragment Laser', 'Ectoplasm',
    'Enchanted Baked Potato', 'Enchanted Iron', 'Enchanted Gold', 'Enchanted Mycelium', 'Enchanted Red sand'
];

let scrapedData = {};

async function updateScrapedData() {
    scrapedData = await scrapeRisk(itemsToScrape);
}

updateScrapedData();
setInterval(updateScrapedData, 4 * 60 * 1000); // Update every 2 minutes

async function getInstasellPrice(itemName) {
    const url = `https://api.hypixel.net/v2/skyblock/bazaar`;
    const response = await fetch(url);
    const data = await response.json();
    const itemData = data.products[itemName.toUpperCase().replace(/ /g, '_')];
    return itemData.quick_status.sellPrice;
}

function formatToMillions(number) {
    let million = 1000000;
    if (number >= million) {
        let formattedNumber = (number / million).toFixed(1) + 'm';
        return formattedNumber;
    } else {
        return number.toString();
    }
}

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log('Ready!');
    await connectToMongoDB();
    setInterval(async () => {
        let itemsBelow150M = [];

        for (const [itemName, data] of Object.entries(scrapedData)) {
            // Risk = Buyout Price - (Amount of Items * instasell price)
            let buyoutPrice = Number(data['Buyout Price'].replace(/,/g, ''));
            let amountOfItems = Number(data['Amount of Items'].replace(/,/g, ''));
            let instasellPrice = await getInstasellPrice(itemName);
            let risk = buyoutPrice - (amountOfItems * instasellPrice);
            console.log(buyoutPrice, amountOfItems, instasellPrice); 
            console.log(itemName, risk)

            if (risk < 150000000) {
                itemsBelow150M.push({ itemName, risk });
            }
        }

        const channel = client.channels.cache.get('1243435054336835664');

        if (itemsBelow150M.length > 0) {
            itemsBelow150M.forEach(({ itemName, risk }) => {

                let formattedRisk = Math.floor(risk).toLocaleString();
                let formattedRiskToMil = formatToMillions(risk);

                const riskEmbed = new EmbedBuilder()
                    .setColor(0x7a9f9a)
                    .setTitle(`**Risk for *${itemName}***`)
                    .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                    .addFields(
                        { name: `Risk`, value: `${formattedRisk} (**${formattedRiskToMil}**)`, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Risk data provided by the Hypixel API', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

                channel.send({ embeds: [riskEmbed] });
            });
        } else {
            channel.send('**🔴 There are no items with a risk below 150M at this time.**');
        }
    }, 4 * 60 * 1000); // Check every 2 minutes
});

// Login to Discord with your app's token
client.login(process.env.TOKEN);

// Event listener for when a message is sent in a server
client.on('messageCreate', async message => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Check if the user is an admin
    /*
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin) {
        message.channel.send('You do not have permission to use this command.');
        return;
    }*/

    // Command handling
    const args = message.content.split(' ');
    const command = args[0];

    if (command === '!add') {
        const username = args[1];
        if (!username) {
            message.channel.send('**🟠 Please provide a username.**');
            return;
        }
        try {
            await addUser(username);
            message.channel.send(`User ${username} added to the database.`);
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error adding the user.**');
        }
    } else if (command === '!delete') {
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
            message.channel.send(statusList);
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    } else if (command === '!all') {
        try {
            const statusList = await checkOnlineStatus();
            message.channel.send(statusList);
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    } else if (command === '!godroll') {
        try {
            let statusList;
        } catch (error) {
            console.error(error);
            message.channel.send('**🔴 There was an error retrieving the online status.**');
        }
    }
});

async function scrapeRisk(items) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    let scrapedData = {};

    for (const itemName of items) {
        const itemUrl = `https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`;
        await page.goto(itemUrl, { waitUntil: 'networkidle2', timeout: 90000 });

        try {
            await page.waitForSelector('tr.svelte-5z8cas', { timeout: 90000 });

            const result = await page.evaluate(() => {
                const rows = document.querySelectorAll('tr.svelte-5z8cas');
                let amountOfItems = '';
                let buyoutPrice = '';

                rows.forEach(row => {
                    const cells = row.querySelectorAll('td.svelte-5z8cas');
                    if (cells.length === 3 && cells[0].textContent.trim() === 'Total:') {
                        amountOfItems = cells[1].textContent.trim();
                        buyoutPrice = cells[2].textContent.trim().replace(' coins', '');
                    }
                });

                return { amountOfItems, buyoutPrice };
            });

            if (result.amountOfItems && result.buyoutPrice) {
                scrapedData[itemName] = {
                    'Amount of Items': result.amountOfItems,
                    'Buyout Price': result.buyoutPrice
                };
            } else {
                console.log(`No data found for ${itemName}`);
            }
        } catch (error) {
            console.error(`Error scraping ${itemName}:`, error);
        }
    }

    await browser.close();
    return scrapedData;
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
        statusList += `**${user.username}:** ${status ? 'Online 🟢' : 'Offline 🔴'}\n`;
        if (status) onlineCount++;
    }

    return `**Griefers Online Status:**\n (${onlineCount}/${totalCount})\n\n${statusList}`;
}

async function onlineOnlineStatus() {
    const collection = db.collection('users');
    const users = await collection.find().toArray();
    let statusList = '';
    let onlineCount = 0;
    const totalCount = users.length;

    for (const user of users) {
        const status = await online(user.uuid);
        if (status) {
            statusList += `**${user.username}:** Online 🟢\n`;
            onlineCount++;
        }
    }

    return `**Online Griefers:** (${onlineCount}/${totalCount})\n\n${statusList}`;
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