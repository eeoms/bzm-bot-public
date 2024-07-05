const { SlashCommandBuilder } = require('discord.js');
const { onlineOnlineStatus } = require('../utils/scraper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check for online griefers'),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const statusList = await onlineOnlineStatus();
            await interaction.editReply({ embeds: [statusList] });
        } catch (error) {
            console.error('Error retrieving online status:', error);
            await interaction.editReply('There was an error retrieving the online status.');
        }
    },
};