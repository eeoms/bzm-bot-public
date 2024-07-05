const { SlashCommandBuilder } = require('discord.js');
const { scrapeTopItems } = require('../utils/scraper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('visit')
        .setDescription('Display top 10 most visited items'),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const embeds = await scrapeTopItems();
            await interaction.editReply({ embeds });
        } catch (error) {
            console.error('Error retrieving top items:', error);
            await interaction.editReply('There was an error retrieving the top items.');
        }
    },
};