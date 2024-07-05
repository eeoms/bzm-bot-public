const { SlashCommandBuilder } = require('discord.js');
const { deleteUser } = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a user from the database')
        .addStringOption(option => option.setName('username').setDescription('The username to delete').setRequired(true)),
    async execute(interaction) {
        const username = interaction.options.getString('username');
        try {
            await deleteUser(username);
            await interaction.reply(`User ${username} deleted from the database.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error deleting the user.');
        }
    },
};