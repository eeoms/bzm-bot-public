const { SlashCommandBuilder } = require('discord.js');
const { setTrackedPlayer } = require('../utils/scraper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('track')
        .setDescription('Set the player to track')
        .addStringOption(option =>
            option.setName('ign').setDescription('The in-game name of the player to track').setRequired(true)
        ),
    async execute(interaction) {
        const ign = interaction.options.getString('ign');
        setTrackedPlayer(ign); // Set the tracked player using the scraper utility function
        await interaction.reply(`Tracking player: ${ign}`);
    },
};