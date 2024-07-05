const { SlashCommandBuilder } = require('discord.js');
const { addUser } = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a user to the database')
        .addStringOption(option => option.setName('username').setDescription('The username to add').setRequired(true)),
    async execute(interaction) {
        const username = interaction.options.getString('username');
        try {
            await addUser(username);
            await interaction.reply(`User ${username} added to the database.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error adding the user.');
        }
    },
};