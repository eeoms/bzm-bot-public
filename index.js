// Require the necessary discord.js classes
const { 
    GatewayIntentBits, 
    PermissionsBitField, 
    ChannelType, 
    Client,
    SlashCommandBuilder, 
    REST, 
    Routes, 
    ActionRowBuilder, 
    ButtonBuilder, 
    EmbedBuilder, 
    ModalBuilder, 
    MessageSelectMenu,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const puppeteer = require('puppeteer');
var Table = require('easy-table')

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const commands = [
    new SlashCommandBuilder().setName('add').setDescription('Add a user to the database')
        .addStringOption(option => option.setName('username').setDescription('The username to add').setRequired(true)),
    new SlashCommandBuilder().setName('delete').setDescription('Delete a user from the database')
        .addStringOption(option => option.setName('username').setDescription('The username to delete').setRequired(true)),
    new SlashCommandBuilder().setName('check').setDescription('Check for online griefers'),
    new SlashCommandBuilder().setName('all').setDescription('Check for all griefers'),
    new SlashCommandBuilder().setName('risk').setDescription('Manage risk notifications')
        .addSubcommand(subcommand => subcommand.setName('start').setDescription('Start risk notifications'))
        .addSubcommand(subcommand => subcommand.setName('stop').setDescription('Stop risk notifications'))
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('Add an item to the risk list')
            .addStringOption(option => option.setName('item').setDescription('The item name').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Delete an item from the risk list')
            .addStringOption(option => option.setName('item').setDescription('The item name').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('List all items in the risk list')),
    new SlashCommandBuilder().setName('bzmhelp').setDescription('Display help for Bazaar Maniacs commands'),
    new SlashCommandBuilder().setName('visit').setDescription('Display top 10 most visited items'),
    new SlashCommandBuilder().setName('lottery').setDescription('Manage lottery')
        .addSubcommand(subcommand => subcommand.setName('create').setDescription('Create a new lottery'))
        .addSubcommand(subcommand => subcommand.setName('join').setDescription('Join the lottery')
            .addStringOption(option => option.setName('amount').setDescription('Amount to join with').setRequired(true))),
    new SlashCommandBuilder().setName('godroll').setDescription('Sort items by risk (low to high)'),
    new SlashCommandBuilder().setName('livemanip').setDescription('Manage manipulation messages for specific items')
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('Add a manipulation message for an item')
            .addStringOption(option => option.setName('item').setDescription('The item to manipulate').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Delete your manipulation message')),
    new SlashCommandBuilder().setName('info').setDescription('Get information about a specific item')
        .addStringOption(option => option.setName('item').setDescription('The item to get information about').setRequired(true)),
    new SlashCommandBuilder().setName('orders').setDescription('Fetches orders for a specified item from Skyblock Bazaar')
        .addStringOption(option => option.setName('item').setDescription('The item to fetch orders for').setRequired(true)),
    new SlashCommandBuilder().setName('detector').setDescription('Manage the manipulation detector')
        .addSubcommand(subcommand => subcommand.setName('on').setDescription('Turn on the manipulation detector'))
        .addSubcommand(subcommand => subcommand.setName('off').setDescription('Turn off the manipulation detector')),
    new SlashCommandBuilder().setName('tracker').setDescription('Manage the griefer tracker')
        .addSubcommand(subcommand => subcommand.setName('on').setDescription('Turn on the griefer tracker'))
        .addSubcommand(subcommand => subcommand.setName('off').setDescription('Turn off the griefer tracker')),
    new SlashCommandBuilder().setName('track').setDescription('Set the player to track')
        .addStringOption(option => option.setName('ign').setDescription('The in-game name of the player to track').setRequired(true)),
    new SlashCommandBuilder().setName('discord').setDescription('Fetches the Discord username associated with a Minecraft IGN')
        .addStringOption(option => option.setName('ign').setDescription('The Minecraft IGN').setRequired(true)),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands('1241904754192547900', '1227669787564314727'),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

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
let manipIntervalId;
let trackerIntervalId = null;
let trackedPlayer = null;
const notifiedUsers = new Set();
const playerStatus = {};

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
        if (isNaN(riskValue) || riskValue >= 70000000) {
            continue;
        }

        const lastSentTime = await getLastSentTime(itemData.itemName);
        if (lastSentTime) {
            const twoHourAgo = new Date(currentTime.getTime() - 2 * 60 * 60 * 1000);
            if (new Date(lastSentTime) > twoHourAgo) {
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
                .setDescription('This item is listed on the manipulate site.')
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
            await channel.send({ embeds: embeds });
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

async function scrapeOrders(item) {
    const url = `https://www.skyblock.bz/product/${item.toUpperCase().replace(/ /g, '_')}`;
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        const orders = await page.evaluate(() => {
            const headers = Array.from(document.querySelectorAll('div.h5.svelte-f7mtyj'));
            let sellOrdersHeader = null;

            for (let header of headers) {
                if (header.innerText === 'Sell Orders') {
                    sellOrdersHeader = header;
                    break;
                }
            }

            if (!sellOrdersHeader) return [];

            const table = sellOrdersHeader.nextElementSibling;
            if (!table || !table.matches('table.svelte-5z8cas')) return [];

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                return {
                    orders: cells[0].innerText,
                    amount: cells[1].innerText,
                    unitPrice: cells[2].innerText,
                    coinEquivalent: cells[3].innerText
                };
            }).slice(0, 30); // Limit to 30 orders
        });

        await browser.close();
        return orders;
    } catch (error) {
        await browser.close();
        throw new Error('Failed to scrape orders');
    }
}

async function scrapeAllItems() {
    let browser;
    try {
        browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto('https://www.skyblock.bz/manipulate', { waitUntil: 'networkidle2', timeout: 90000 });

        const itemsData = await page.evaluate(() => {
            const cards = document.querySelectorAll('div.card.svelte-1crwetk');
            const scrapedItems = [];

            cards.forEach(card => {
                const itemNameElement = card.querySelector('div.item-name.svelte-1crwetk');
                const itemName = itemNameElement ? itemNameElement.textContent.trim() : '';

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
            });

            return scrapedItems;
        });

        return itemsData;
    } catch (error) {
        console.error('Error during scraping:', error);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function scrapeAndDetect() {
    try {
        const itemsData = await scrapeAllItems();
        const channel = client.channels.cache.get('1257070383950204980');

        const currentTime = Date.now();

        // Filter items with the specified criteria and apply cooldown check
        const filteredItems = itemsData.filter(itemData => {
            console.log(itemData.partial);

            if (!itemData.partial || !itemData.partial.risk || !itemData.partial.postBuyoutPrice || !itemData.partial.amountOfItems) {
                return false;
            }

            const riskValue = parseFloat(itemData.partial.risk.replace(/,/g, ''));
            const postBuyoutPrice = parseFloat(itemData.partial.postBuyoutPrice.replace(/,/g, ''));
            const amountOfItems = parseInt(itemData.partial.amountOfItems.replace(/,/g, ''));

            const lastNotifiedTime = detectedItemsCooldown.get(itemData.itemName);
            const isInCooldown = lastNotifiedTime && (currentTime - lastNotifiedTime < COOLDOWN_PERIOD);

            return !isInCooldown &&
                !isNaN(riskValue) && riskValue <= 5000000 &&
                !isNaN(postBuyoutPrice) && postBuyoutPrice >= 1000000 &&
                !isNaN(amountOfItems) && amountOfItems <= 200000;
        });

        if (filteredItems.length > 0) {
            const embeds = filteredItems.map(({ itemName, imageUrl, partial }) => {
                detectedItemsCooldown.set(itemName, currentTime); // Update the cooldown map

                return new EmbedBuilder()
                    .setColor(0xA91313)
                    .setTitle(`**Possible Manipulated Item: *${itemName}***`)
                    .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                    .setDescription('This item meets the criteria for a possible manipulated item.')
                    .setThumbnail(imageUrl)
                    .addFields(
                        { name: 'Buyout Price', value: `${partial.buyoutPrice}`, inline: false },
                        { name: 'Average Buy Price', value: `${partial.averageBuyPrice}`, inline: false },
                        { name: 'Amount of Items', value: `${partial.amountOfItems}`, inline: false },
                        { name: 'Post-Buyout Price', value: `${partial.postBuyoutPrice}`, inline: false },
                        { name: 'Risk', value: `${partial.risk}`, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            });

            for (let i = 0; i < embeds.length; i += 10) {
                const embedBatch = embeds.slice(i, i + 10);
                await channel.send({ embeds: embedBatch });
            }
        }
    } catch (error) {
        console.error('Error during scraping and detection:', error);
    }
}

// Login to Discord with your app's token
client.login(process.env.TOKEN);
let pot = [];
let potTotal = 0;
let middleMan = null; // Variable to store the middle man
let joinedUsers = new Set();
let lotteryActive = false; // State variable to track if the lottery is active
const manipulationMessages = new Map(); // Store message IDs for each item
const detectedItemsCooldown = new Map();
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour in milliseconds

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (interaction.user.bot) return;

    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (commandName === 'add') {
        if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }

        const username = options.getString('username');
        try {
            await addUser(username);
            await interaction.reply(`**User ${username} added to the database.**`);
        } catch (error) {
            console.error(error);
            await interaction.reply('**🔴 There was an error adding the user.**');
        }
    } else if (commandName === 'delete') {
        if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }

        const username = options.getString('username');
        try {
            await deleteUser(username);
            await interaction.reply(`**User ${username} deleted from the database.**`);
        } catch (error) {
            console.error(error);
            await interaction.reply('**🔴 There was an error deleting the user.**');
        }
    } else if (commandName === 'check') {
        /*if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }*/
    
        try {
            // Defer the reply to acknowledge the interaction and give you time to perform the long-running task
            await interaction.deferReply();
    
            // Perform the long-running task
            const statusList = await onlineOnlineStatus();
    
            // Send the final response
            await interaction.editReply({ embeds: [statusList] });
        } catch (error) {
            console.error('Error retrieving online status:', error);
            // Edit the deferred reply to indicate an error occurred
            await interaction.editReply('**🔴 There was an error retrieving the online status.**');
        }
    } else if (commandName === 'all') {
        /*if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }*/
    
        try {
            // Defer the reply to acknowledge the interaction and give you time to perform the long-running task
            await interaction.deferReply();
    
            // Perform the long-running task
            const embed = await checkOnlineStatus();
    
            // Send the final response
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error retrieving online status:', error);
            // Edit the deferred reply to indicate an error occurred
            await interaction.editReply('**🔴 There was an error retrieving the online status.**');
        }
    } else if (commandName === 'visit') {
        if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }
    
        try {
            // Defer the reply to acknowledge the interaction and give you time to perform the long-running task
            await interaction.deferReply();
    
            // Perform the long-running task
            const embeds = await scrapeTopItems();
    
            // Send the final response
            await interaction.editReply({ embeds: embeds });
        } catch (error) {
            console.error('Error retrieving top items:', error);
            // Edit the deferred reply to indicate an error occurred
            await interaction.editReply('**🔴 There was an error retrieving the top items.**');
        }
    } else if (commandName === 'risk') {
        const subCommand = options.getSubcommand();

        if (subCommand === 'start') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            if (!intervalId) {
                intervalId = setInterval(scrapeAndSend, 2 * 60 * 1000); // Start the interval
                await interaction.reply('Risk notifications interval started.');
            } else {
                await interaction.reply('Risk notifications interval is already running.');
            }
        } else if (subCommand === 'stop') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            if (intervalId) {
                clearInterval(intervalId); // Stop the interval
                intervalId = null;
                await interaction.reply('Risk notifications interval stopped.');
            } else {
                await interaction.reply('Risk notifications interval is not running.');
            }
        } else if (subCommand === 'add') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            const itemName = options.getString('item');
            try {
                await addItemToDatabase(itemName);
                await interaction.reply(`Item "${itemName}" added to the database.`);
            } catch (error) {
                console.error(error);
                await interaction.reply('**🔴 There was an error adding the item to the database.**');
            }
        } else if (subCommand === 'delete') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            const itemName = options.getString('item');
            try {
                await deleteItemFromDatabase(itemName);
                await interaction.reply(`Item "${itemName}" deleted from the database.`);
            } catch (error) {
                console.error(error);
                await interaction.reply('**🔴 There was an error deleting the item from the database.**');
            }
        } else if (subCommand === 'list') {
            try {
                const itemsList = await listItemsFromDatabase();
                await interaction.reply(`Items in the database: ${itemsList.join(', ')}`);
            } catch (error) {
                console.error('Error listing items from the database:', error);
                await interaction.reply('**🔴 There was an error listing items from the database.**');
            }
        }
    } else if (commandName === 'bzmhelp') {
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Commands')
            .addFields(
                { name: '/risk start/stop', value: `Start/stop the risk (Admin only)`, inline: false },
                { name: '/risk add [item]', value: `Add items to the risk command (Admin only)`, inline: false },
                { name: '/risk delete [item]', value: `Delete items from the risk command (Admin only)`, inline: false },
                { name: '/risk list', value: `Lists items for the risk command`, inline: false },
                { name: '/check', value: `Check for online griefers`, inline: false },
                { name: '/all', value: `Check for all griefers`, inline: false },
                { name: '/add [player]', value: `Add a griefer (Admin only)`, inline: false },
                { name: '/delete [player]', value: `Delete a griefer (Admin only)`, inline: false },
                { name: '/visit', value: `Top 10 most visited items`, inline: false },
                { name: '/lottery create', value: `Creates a lottery`, inline: false },
                { name: '/godroll', value: `Lists items sorted by risk on the manip site`, inline: false },
                { name: '/info', value: `Lists manip info for specified item`, inline: false },
                { name: '/orders', value: `Lists all orders (only items with under 30) of an item`, inline: false },
            )
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

        await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'visit') {
        if (!isAdmin) {
            await interaction.reply('**🔴 You do not have permission to use this command.**');
            return;
        }
    
        try {
            // Defer the reply to acknowledge the interaction and give you time to perform the long-running task
            await interaction.deferReply();
    
            // Perform the long-running task
            const embeds = await scrapeTopItems();
    
            // Send the final response
            await interaction.editReply({ embeds: embeds });
        } catch (error) {
            console.error('Error retrieving top items:', error);
            // Edit the deferred reply to indicate an error occurred
            await interaction.editReply('**🔴 There was an error retrieving the top items.**');
        }
    } else if (commandName === 'lottery') {
        const subCommand = options.getSubcommand();

        if (subCommand === 'create') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            lotteryActive = true;
            pot = [];
            potTotal = 0;
            joinedUsers = new Set();

            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription('A new lottery has been created! You can now join the lottery using `/lottery join [amount]`.')
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            await interaction.reply({ embeds: [embed] });
        } else if (subCommand === 'join') {
            const amountString = options.getString('amount');

            if (!lotteryActive) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('The lottery has not been created yet.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (joinedUsers.has(interaction.user.id)) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('You have already joined the lottery.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (!amountString || !amountString.endsWith('m')) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Please specify a valid amount in millions (e.g., 10m).')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const amount = parseInt(amountString.slice(0, -1));
            if (isNaN(amount) || amount <= 0 || amount > 9999) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Please specify a valid amount in millions between 1 and 9999 (e.g., 10m).')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const user = interaction.user;

            joinedUsers.add(user.id);
            pot.push({ user, amount, paid: false });
            potTotal += amount;

            const shares = pot.map(entry => {
                const percentage = ((entry.amount / potTotal) * 100).toFixed(2);
                return `${entry.user.username} ${percentage}% of pot`;
            }).join(', ');

            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`You joined the pot with ${amount}m! (${shares})`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            await interaction.reply({ embeds: [embed] });
        } else if (subCommand === 'start') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }

            if (pot.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('No one has joined the pot yet!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            let totalWeight = pot.reduce((sum, entry) => sum + entry.amount, 0);
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
            const winnerIndex = pot.indexOf(winner);
            pot.splice(winnerIndex, 1);
            potTotal -= winner.amount;

            const loserMessage = pot.map(entry => `<@${entry.user.id}> owes ${entry.amount}m`).join(', ');
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setDescription(`<@${winner.user.id}> wins ${totalPot}m pot with a ${(winner.amount / totalPot * 100).toFixed(2)}% chance! ${loserMessage}.`)
                .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
            await interaction.reply({ embeds: [embed] });

            pot = [];
            potTotal = 0;
            lotteryActive = false;
        } else if (subCommand === 'list') {
            if (pot.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('No one has joined the pot yet!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
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
            await interaction.reply({ embeds: [embed] });
        } else if (subCommand === 'leave') {
            const userIndex = pot.findIndex(entry => entry.user.id === interaction.user.id);
            if (userIndex !== -1) {
                const removedUser = pot.splice(userIndex, 1)[0];
                potTotal -= removedUser.amount;
                joinedUsers.delete(interaction.user.id);
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription(`You have been removed from the pot. Your contribution of ${removedUser.amount}m has been refunded.`)
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('You are not in the pot.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            }
        } else if (subCommand === 'mm') {
            const mmCommand = options.getString('action');

            if (mmCommand === 'set') {
                const mentionedUser = interaction.options.getUser('user');
                if (!mentionedUser) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('Please mention a user to set as the middle man.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                middleMan = mentionedUser;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription(`Middle man set to <@${mentionedUser.id}>.`)
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            } else if (mmCommand === 'get') {
                if (!middleMan) {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription('No middle man is currently set.')
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    await interaction.reply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(0xA91313)
                        .setDescription(`Current middle man: <@${middleMan.id}>.`)
                        .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                    await interaction.reply({ embeds: [embed] });
                }
            } else if (mmCommand === 'remove') {
                middleMan = null;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Middle man removed.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Invalid mm command. Use `set`, `get`, or `remove`.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            }
        } else if (subCommand === 'paid') {
            if (!interaction.member.permissions.has('ADMINISTRATOR')) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('You do not have permission to mark users as paid.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const mentionedUser = interaction.options.getUser('user');
            if (!mentionedUser) {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Please mention a user to mark as paid.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const userInPot = pot.find(entry => entry.user.id === mentionedUser.id);
            if (userInPot) {
                userInPot.paid = true;
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('Alright!')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setDescription('This user is not in the pot.')
                    .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });
                await interaction.reply({ embeds: [embed] });
            }
        }
    } else if (commandName === 'godroll') {
        try {
            const items = await getItemsFromDatabase();

            // Defer the reply to acknowledge the interaction and give you time to perform the long-running task
            await interaction.deferReply();

            const itemsData = await scrapeManipulate(items);

            const sortedItems = itemsData
                .filter(item => {
                    const riskValue = parseFloat(item.partial.risk.replace(/,/g, ''));
                    return !isNaN(riskValue);
                })
                .sort((a, b) => parseFloat(a.partial.risk.replace(/,/g, '')) - parseFloat(b.partial.risk.replace(/,/g, '')));

            if (sortedItems.length === 0) {
                await interaction.reply('No items found with valid risk values.');
                return;
            }

            const sortedItemsList = sortedItems.map(item => `${item.itemName}: ${item.partial.risk}`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle('Sorted Items by Risk (Low to High)')
                .setDescription(sortedItemsList)
                .setTimestamp()
                .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

            
            // Send the final response
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching and sorting items:', error);
            await interaction.reply('**🔴 There was an error fetching and sorting items by risk.**');
        }
    } else if (commandName === 'livemanip') {
        const subCommand = options.getSubcommand();
        const userId = interaction.user.id;
        const targetChannelId = '1246898112157712488';
        const targetChannel = await client.channels.fetch(targetChannelId);

        if (!targetChannel) {
            await interaction.reply({ content: '**🔴 The specified channel does not exist.**', ephemeral: true });
            return;
        }

        if (subCommand === 'add') {
            if (manipulationMessages.has(userId)) {
                await interaction.reply({ content: '**🔴 You already have an active manipulation message. Delete it before adding a new one.**', ephemeral: true });
                return;
            }

            const item = options.getString('item');
            await interaction.deferReply({ ephemeral: true });

            try {
                const imageUrl = await getImage(item);

                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setTitle('Manipulation Alert')
                    .setDescription(`${interaction.user} is manipulating **${item}**`)
                    .setThumbnail(imageUrl)
                    .setTimestamp()
                    .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

                const message = await targetChannel.send({ embeds: [embed] });
                manipulationMessages.set(userId, message.id); // Store the message ID with the user ID as key

                await interaction.editReply({ content: '**🟢 Manipulation message sent successfully.**' });
            } catch (error) {
                console.error('Error adding manipulation message:', error);
                await interaction.editReply({ content: '**🔴 There was an error sending the manipulation message.**' });
            }

        } else if (subCommand === 'delete') {
            const messageId = manipulationMessages.get(userId);
            if (!messageId) {
                await interaction.reply({ content: '**🔴 No manipulation message found for you.**', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const message = await targetChannel.messages.fetch(messageId);
                if (message) {
                    await message.delete();
                    manipulationMessages.delete(userId); // Remove the entry from the map
                    await interaction.editReply({ content: '**🟢 Manipulation message deleted successfully.**' });
                } else {
                    await interaction.editReply({ content: '**🔴 No manipulation message found for you.**' });
                }
            } catch (error) {
                console.error('Error deleting manipulation message:', error);
                await interaction.editReply({ content: '**🔴 There was an error deleting the manipulation message.**' });
            }
        }
    } else if (commandName === 'info') {
        const item = options.getString('item');

        // Defer the reply to acknowledge the interaction immediately
        await interaction.deferReply();


        const itemsData = await scrapeManipulate([item]);

        if (itemsData.length === 0) {
            await interaction.editReply(`**🔴 Item not found: ${item}. It may not be on the manipulation page.**`);
        } else {
            const { itemName, imageUrl, partial } = itemsData[0];
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle(`**Info for *${itemName}***`)
                .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                .setDescription('This item is listed on the manipulate site.')
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

            await interaction.editReply({ embeds: [embed] });
        }
    } else if (commandName === 'orders') {
        const item = options.getString('item');

        // Defer the reply to acknowledge the interaction
        await interaction.deferReply();

        try {
            const orders = await scrapeOrders(item);
            const imageUrl = await getImage(item);
    
            const formattedItem = item.toUpperCase().replace(/ /g, '_');
    
            if (orders.length === 0) {
                await interaction.editReply(`**🔴 No orders found for item: ${item}.**`);
                return;
            }
    
            var Table = require('easy-table');
            var t = new Table;
    
            function formatNumber(num) {
                if (num >= 1000000) {
                    return (num / 1000000).toFixed(1) + 'm';
                } else if (num >= 1000) {
                    return (num / 1000).toFixed(1) + 'k';
                } else {
                    return num.toString();
                }
            }
    
            orders.forEach(function(order) {
                const unitPrice = parseFloat(order.unitPrice.replace(/[^\d.-]/g, ''));
                const coinEquivalent = parseFloat(order.coinEquivalent.replace(/[^\d.-]/g, ''));
    
                t.cell('Orders', formatNumber(order.orders));
                t.cell('Amount', formatNumber(order.amount));
                t.cell('Unit Price', formatNumber(unitPrice));
                t.cell('Coin Equivalent', formatNumber(coinEquivalent));
                t.newRow();
            });
    
            const tableOutput = t.toString();
    
            const responseMessage = `**Orders for ${item}**\n\`\`\`\n${tableOutput}\n\`\`\``;
    
            await interaction.editReply(responseMessage);
        } catch (error) {
            console.error('Error fetching orders:', error);
            await interaction.editReply('**🔴 There was an error fetching orders for the item.**');
        }
    } else if (commandName === 'detector') {
        const subCommand = options.getSubcommand();
    
        if (subCommand === 'on') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }
    
            if (!manipIntervalId) {
                manipIntervalId = setInterval(scrapeAndDetect, 5 * 1000); // Start the interval
                await interaction.reply({ content: 'Manipulation detector started.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Manipulation detector is already running.', ephemeral: true });
            }
        } else if (subCommand === 'off') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }
    
            if (manipIntervalId) {
                clearInterval(manipIntervalId); // Stop the interval
                manipIntervalId = null;
                await interaction.reply({ content: 'Manipulation detector stopped.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Manipulation detector is not running.', ephemeral: true });
            }
        }
    } else if (commandName === 'tracker') {
        const subCommand = options.getSubcommand();
    
        if (subCommand === 'on') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }
    
            if (!trackerIntervalId) {
                trackerIntervalId = setInterval(checkAndNotify, 50000); // Start the interval (every 5 seconds)
                await interaction.reply('Griefer tracker started.');
            } else {
                await interaction.reply('Griefer tracker is already running.');
            }
        } else if (subCommand === 'off') {
            if (!isAdmin) {
                await interaction.reply('**🔴 You do not have permission to use this command.**');
                return;
            }
    
            if (trackerIntervalId) {
                clearInterval(trackerIntervalId); // Stop the interval
                trackerIntervalId = null;
                await interaction.reply('Griefer tracker stopped.');
            } else {
                await interaction.reply('Griefer tracker is not running.');
            }
        }
    } else if (commandName === 'track') {
        const ign = options.getString('ign');
        trackedPlayer = ign;
        await interaction.reply(`Tracking player: ${ign}`);
    } else if (commandName === 'discord') {
        const ign = options.getString('ign');
        try {
            const uuidResponse = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
            if (!uuidResponse.ok) {
                throw new Error(`API Error: ${uuidResponse.statusText}`);
            }
            const uuidData = await uuidResponse.json();
            const uuid = uuidData.id;
            const hypixelApiKey = '09f001bc-b747-4b14-ad50-810955eb409a'

            const playerResponse = await fetch(`https://api.hypixel.net/player?key=${hypixelApiKey}&uuid=${uuid}`);
            if (!playerResponse.ok) {
                throw new Error(`API Error: ${playerResponse.statusText}`);
            }
            const playerData = await playerResponse.json();
            const discordUsername = playerData.player.socialMedia.links.DISCORD;

            if (discordUsername) {
                await interaction.reply(`The Discord username associated with ${ign} is **${discordUsername}**.`);
            } else {
                await interaction.reply(`No Discord username found for ${ign}.`);
            }
        } catch (error) {
            console.error(error);
            await interaction.reply(`An error occurred while fetching the Discord username for ${ign}.`);
        }
    }
});
 
async function getImage(itemName) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const formattedItemName = itemName.toUpperCase().replace(/ /g, '_');
    const url = `https://www.skyblock.bz/product/${formattedItemName}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

    const imageUrl = await page.evaluate(() => {
        const imageElement = document.querySelector('img');
        return imageElement ? imageElement.src : '';
    });

    await browser.close();
    return imageUrl;
}

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

async function checkAndNotify() {
    try {
        const statusEmbed = await checkOnlineStatus();
        const channel = client.channels.cache.get('1257076698575409223');

        if (statusEmbed && statusEmbed.data.fields && statusEmbed.data.fields.length > 0) {
            await channel.send({ embeds: [statusEmbed] });
        }
    } catch (error) {
        console.error('Error in checkAndNotify:', error);
    }
}

async function checkOnlineStatus() {
    try {
        if (!trackedPlayer) return null;

        const user = await db.collection('users').findOne({ username: trackedPlayer });
        if (!user) return null;

        const status = await online(user.uuid);
        let statusIndicator = '';

        if (status) {
            if (!playerStatus[user.uuid]) {
                playerStatus[user.uuid] = 'online';
                statusIndicator = '🟢 just got on';
            } else if (playerStatus[user.uuid] === 'offline') {
                playerStatus[user.uuid] = 'online';
                statusIndicator = '🟢 just got on';
            } else {
                statusIndicator = '🟡 currently on';
            }
        } else {
            if (playerStatus[user.uuid] === 'online') {
                playerStatus[user.uuid] = 'offline';
                statusIndicator = '🔴 logged off';
            } else {
                statusIndicator = '🔴 logged off';
            }
        }

        if (notifiedUsers.has(user.uuid) && statusIndicator === '🟢 just got on') return null;

        if (statusIndicator === '🟢 just got on') {
            notifiedUsers.add(user.uuid);
            setTimeout(() => notifiedUsers.delete(user.uuid), 60 * 60 * 1000); // Remove from set after 1 hour
        }

        const statusEmbed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Online Griefers')
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' })
            .addFields({ name: `**${trackedPlayer} Status:**`, value: `${trackedPlayer} ${statusIndicator}` });

        return statusEmbed;
    } catch (error) {
        console.error('Error in checkOnlineStatus:', error);
        return null; // Return null if an error occurs
    }
}

async function online(uuid) {
    try {
        const url = `https://api.hypixel.net/v2/status?uuid=${uuid}&key=09f001bc-b747-4b14-ad50-810955eb409a`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.session.online;
    } catch (error) {
        console.error('Error in online function:', error);
        return false; // Return false if an error occurs
    }
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
