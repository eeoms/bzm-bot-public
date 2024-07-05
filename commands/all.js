const { SlashCommandBuilder } = require('discord.js');
const { checkOnlineStatus } = require('../utils/scraper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('all')
        .setDescription('Check for all griefers'),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const embed = await checkOnlineStatus();
            if (embed) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('No tracked player or an error occurred.');
            }
        } catch (error) {
            console.error('Error retrieving online status:', error);
            await interaction.editReply('There was an error retrieving the online status.');
        }
    },
};