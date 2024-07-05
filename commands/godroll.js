const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { scrapeManipulate } = require('../utils/scraper');
const { getItemsFromDatabase } = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('godroll')
        .setDescription('Sort items by risk (low to high)'),
    async execute(interaction) {
        try {
            const items = await getItemsFromDatabase();

            await interaction.deferReply();

            const itemsData = await scrapeManipulate(items);

            const sortedItems = itemsData
                .filter(item => {
                    const riskValue = parseFloat(item.partial.risk.replace(/,/g, ''));
                    return !isNaN(riskValue);
                })
                .sort((a, b) => parseFloat(a.partial.risk.replace(/,/g, '')) - parseFloat(b.partial.risk.replace(/,/g, '')));

            if (sortedItems.length === 0) {
                await interaction.editReply('No items found with valid risk values.');
                return;
            }

            const sortedItemsList = sortedItems.map(item => `${item.itemName}: ${item.partial.risk}`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle('Sorted Items by Risk (Low to High)')
                .setDescription(sortedItemsList)
                .setTimestamp()
                .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching and sorting items:', error);
            await interaction.reply('There was an error fetching and sorting items by risk.');
        }
    },
};