const puppeteer = require('puppeteer');
const { getDb } = require('./database');
const { EmbedBuilder } = require('discord.js');

let trackedPlayer = ''; // Default value
const notifiedUsers = new Set();
const playerStatus = {};
const detectedItemsCooldown = new Map();
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour cooldown in milliseconds

function setTrackedPlayer(ign) {
    trackedPlayer = ign;
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

async function checkOnlineStatus() {
    try {
        if (!trackedPlayer) return null;
        const db = getDb();

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

        const embedValue = `${trackedPlayer} ${statusIndicator}` || 'No status available';

        const statusEmbed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Online Griefers')
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' })
            .addFields({ name: `**${trackedPlayer} Status:**`, value: embedValue });

        return statusEmbed;
    } catch (error) {
        console.error('Error in checkOnlineStatus:', error);
        return null; // Return null if an error occurs
    }
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

async function onlineOnlineStatus() {
    const db = getDb();
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

async function scrapeAndSend(client) {
    const db = getDb();
    const itemsToScrape = await getItemsFromDatabase(db);
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

        const lastSentTime = await getLastSentTime(db, itemData.itemName);
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
            await updateLastSentTime(db, itemData.itemName);
        }
    }
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

async function getItemsFromDatabase() {
    const db = getDb();
    const collection = db.collection('scrapedItems');
    const items = await collection.find().toArray();
    return items.map(item => item.name);
}

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

async function getLastSentTime(itemName) {
    const db = getDb();
    const collection = db.collection('sentItems');
    const item = await collection.findOne({ name: itemName });
    return item ? item.lastSent : null;
}

async function updateLastSentTime(itemName) {
    const db = getDb();
    const collection = db.collection('sentItems');
    await collection.updateOne(
        { name: itemName },
        { $set: { lastSent: new Date() } },
        { upsert: true }
    );
}

async function scrapeAndDetect(client) {
    try {
        const itemsData = await scrapeAllItems();
        const channel = client.channels.cache.get('1257070383950204980');

        const currentTime = Date.now();

        // Filter items with the specified criteria and apply cooldown check
        const filteredItems = itemsData.filter(itemData => {

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

async function checkAndNotify(client) {
    try {
        const statusEmbed = await checkOnlineStatus();
        const channel = client.channels.cache.get('1257076698575409223');

        if (statusEmbed && statusEmbed.data.fields && statusEmbed.data.fields.length > 0) {
            await channel.send({ embeds: [statusEmbed] });
        } else {
            console.log('error at checkAndNotify')
        }
    } catch (error) {
        console.error('Error in checkAndNotify:', error);
    }
}

module.exports = { scrapeAndSend, scrapeManipulate, scrapeOrders, scrapeAllItems, onlineOnlineStatus, checkOnlineStatus, scrapeTopItems, getImage, scrapeAndDetect, checkAndNotify, setTrackedPlayer };