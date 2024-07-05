const { SlashCommandBuilder } = require('discord.js');
const { scrapeAndDetect } = require('../utils/scraper');

let manipIntervalId;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('detector')
        .setDescription('Manage the manipulation detector')
        .addSubcommand(subcommand =>
            subcommand
                .setName('on')
                .setDescription('Turn on the manipulation detector')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('off')
                .setDescription('Turn off the manipulation detector')
        ),
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR');

        if (!isAdmin) {
            await interaction.reply('You do not have permission to use this command.');
            return;
        }

        if (subCommand === 'on') {
            if (!manipIntervalId) {
                manipIntervalId = setInterval(() => scrapeAndDetect(interaction.client), 5 * 1000);
                await interaction.reply('Manipulation detector started.');
            } else {
                await interaction.reply('Manipulation detector is already running.');
            }
        } else if (subCommand === 'off') {
            if (manipIntervalId) {
                clearInterval(manipIntervalId);
                manipIntervalId = null;
                await interaction.reply('Manipulation detector stopped.');
            } else {
                await interaction.reply('Manipulation detector is not running.');
            }
        }
    },
};