const { SlashCommandBuilder } = require('discord.js');
const { checkAndNotify } = require('../utils/scraper');

let trackerIntervalId = null;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Manage the griefer tracker')
        .addSubcommand(subcommand =>
            subcommand
                .setName('on')
                .setDescription('Turn on the griefer tracker')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('off')
                .setDescription('Turn off the griefer tracker')
        ),
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR');

        if (!isAdmin) {
            await interaction.reply('You do not have permission to use this command.');
            return;
        }

        if (subCommand === 'on') {
            if (!trackerIntervalId) {
                trackerIntervalId = setInterval(() => checkAndNotify(interaction.client), 5000);
                await interaction.reply('Griefer tracker started.');
            } else {
                await interaction.reply('Griefer tracker is already running.');
            }
        } else if (subCommand === 'off') {
            if (trackerIntervalId) {
                clearInterval(trackerIntervalId);
                trackerIntervalId = null;
                await interaction.reply('Griefer tracker stopped.');
            } else {
                await interaction.reply('Griefer tracker is not running.');
            }
        }
    },
};