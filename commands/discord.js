const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('discord')
        .setDescription('Fetches the Discord username associated with a Minecraft IGN')
        .addStringOption(option =>
            option.setName('ign').setDescription('The Minecraft IGN').setRequired(true)
        ),
    async execute(interaction) {
        const ign = interaction.options.getString('ign');
        try {
            const uuidResponse = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
            if (!uuidResponse.ok) {
                throw new Error(`API Error: ${uuidResponse.statusText}`);
            }
            const uuidData = await uuidResponse.json();
            const uuid = uuidData.id;
            const hypixelApiKey = config.hypixelApiKey

            const playerResponse = await fetch(`https://api.hypixel.net/player?key=${hypixelApiKey}&uuid=${uuid}`);
            if (!playerResponse.ok) {
                throw new Error(`API Error: ${playerResponse.statusText}`);
            }
            const playerData = await playerResponse.json();
            const discordUsername = playerData.player.socialMedia.links.DISCORD;

            if (discordUsername) {
                await interaction.reply(`The Discord username associated with ${ign} is **${discordUsername}**.`);
            } else {
                await interaction.reply(`No Discord username found for ${ign}.`);
            }
        } catch (error) {
            console.error(error);
            await interaction.reply(`An error occurred while fetching the Discord username for ${ign}.`);
        }
    },
};