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

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log('Ready!');
    await connectToMongoDB();
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
    } else if (command === '!risk') {
        const itemName = args.slice(1).join(' ');
        if (!itemName) {
            message.channel.send('**🟠 Please provide an item name.**');
            return;
        }
        try {
            const { partialData, imgSrc } = await risk(itemName);

            const url = `https://api.hypixel.net/v2/skyblock/bazaar`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const data = await response.json();
            const itemKey = itemName.toUpperCase().replace(/ /g, '_');

            if ((!partialData || Object.keys(partialData).length === 0) && data.products && data.products[itemKey] && data.products[itemKey].product_id === itemKey) {
                message.channel.send(`**🟠 I'm sorry, but that item has more then 30 sell orders, please make sure it is listed on https://www.skyblock.bz/manipulate website.**`);
                return;
            } else if (!partialData || Object.keys(partialData).length === 0) {
                message.channel.send(`**🔴 I'm sorry, but I can't find *${itemName}*, please make sure it is spelt right and on the https://www.skyblock.bz/manipulate website.**`);
                return;
            } else {
                
                let emoji;
                
                let noCommaRisk = partialData['Risk'].replace(/,/g, '');
                let numRisk = Number(noCommaRisk);
                if (numRisk <= 200000000) {
                    emoji = '🟢';
                } else {
                    emoji = '🔴';
                }

                const riskEmbed = new EmbedBuilder()
                    .setColor(0x7a9f9a)
                    .setTitle(`**Risk for *${itemName}***`)
                    .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                    .setDescription(`**Partial** risk and other stats for *${itemName}*`)
                    .setThumbnail(imgSrc)
                    .addFields(
                        { name: 'Buyout Price', value: partialData['Buyout Price'], inline: false },
                        { name: 'Average Buy Price', value: partialData['Average Buy Price'], inline: false },
                        { name: 'Amount of Items', value: partialData['Amount of Items'], inline: false },
                        { name: 'Post-Buyout Price', value: partialData['Post-Buyout Price'], inline: false },
                        { name: `Risk ${emoji}`, value: partialData['Risk'], inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Risk data provided by the Hypixel API', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

                message.channel.send({ embeds: [riskEmbed] });
            }
        } catch (error) {
            console.error(error);
            message.channel.send('There was an error retrieving the risk.');
        }
    }
});

async function risk(itemName) {
    let risk;
    let amountOfItems;
    let buyoutPrice;
    let sellPrice;

    let result;
    return result;
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