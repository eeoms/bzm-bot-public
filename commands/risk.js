const { SlashCommandBuilder } = require('discord.js');
const { addItemToDatabase, deleteItemFromDatabase, listItemsFromDatabase } = require('../utils/database');
const { scrapeAndSend } = require('../utils/scraper');

let intervalId;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('risk')
        .setDescription('Manage risk notifications')
        .addSubcommand(subcommand => subcommand.setName('start').setDescription('Start risk notifications'))
        .addSubcommand(subcommand => subcommand.setName('stop').setDescription('Stop risk notifications'))
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('Add an item to the risk list')
            .addStringOption(option => option.setName('item').setDescription('The item name').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Delete an item from the risk list')
            .addStringOption(option => option.setName('item').setDescription('The item name').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('List all items in the risk list')),
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR');

        if (subCommand === 'start') {
            if (!isAdmin) {
                await interaction.reply('You do not have permission to use this command.');
                return;
            }

            if (!intervalId) {
                intervalId = setInterval(scrapeAndSend, 2 * 60 * 1000);
                await interaction.reply('Risk notifications interval started.');
            } else {
                await interaction.reply('Risk notifications interval is already running.');
            }
        } else if (subCommand === 'stop') {
            if (!isAdmin) {
                await interaction.reply('You do not have permission to use this command.');
                return;
            }

            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
                await interaction.reply('Risk notifications interval stopped.');
            } else {
                await interaction.reply('Risk notifications interval is not running.');
            }
        } else if (subCommand === 'add') {
            if (!isAdmin) {
                await interaction.reply('You do not have permission to use this command.');
                return;
            }

            const itemName = interaction.options.getString('item');
            try {
                await addItemToDatabase(itemName);
                await interaction.reply(`Item "${itemName}" added to the database.`);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error adding the item to the database.');
            }
        } else if (subCommand === 'delete') {
            if (!isAdmin) {
                await interaction.reply('You do not have permission to use this command.');
                return;
            }

            const itemName = interaction.options.getString('item');
            try {
                await deleteItemFromDatabase(itemName);
                await interaction.reply(`Item "${itemName}" deleted from the database.`);
            } catch (error) {
                console.error(error);
                await interaction.reply('There was an error deleting the item from the database.');
            }
        } else if (subCommand === 'list') {
            try {
                const itemsList = await listItemsFromDatabase();
                await interaction.reply(`Items in the database: ${itemsList.join(', ')}`);
            } catch (error) {
                console.error('Error listing items from the database:', error);
                await interaction.reply('There was an error listing items from the database.');
            }
        }
    },
};