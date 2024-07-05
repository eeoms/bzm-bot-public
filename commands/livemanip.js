const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getImage } = require('../utils/scraper');
const config = require('../config.json');

const manipulationMessages = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('livemanip')
        .setDescription('Manage manipulation messages for specific items')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a manipulation message for an item')
                .addStringOption(option =>
                    option.setName('item').setDescription('The item to manipulate').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete your manipulation message')
        ),
    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const targetChannelId = config.manipulationChannel;
        const targetChannel = await interaction.client.channels.fetch(targetChannelId);

        if (!targetChannel) {
            await interaction.reply({ content: 'The specified channel does not exist.', ephemeral: true });
            return;
        }

        if (subCommand === 'add') {
            if (manipulationMessages.has(userId)) {
                await interaction.reply({ content: 'You already have an active manipulation message. Delete it before adding a new one.', ephemeral: true });
                return;
            }

            const item = interaction.options.getString('item');
            await interaction.deferReply({ ephemeral: true });

            try {
                const imageUrl = await getImage(item);

                const embed = new EmbedBuilder()
                    .setColor(0xA91313)
                    .setTitle('Manipulation Alert')
                    .setDescription(`${interaction.user} is manipulating **${item}**`)
                    .setThumbnail(imageUrl)
                    .setTimestamp()
                    .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

                const message = await targetChannel.send({ embeds: [embed] });
                manipulationMessages.set(userId, message.id);

                await interaction.editReply({ content: 'Manipulation message sent successfully.' });
            } catch (error) {
                console.error('Error adding manipulation message:', error);
                await interaction.editReply({ content: 'There was an error sending the manipulation message.' });
            }

        } else if (subCommand === 'delete') {
            const messageId = manipulationMessages.get(userId);
            if (!messageId) {
                await interaction.reply({ content: 'No manipulation message found for you.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const message = await targetChannel.messages.fetch(messageId);
                if (message) {
                    await message.delete();
                    manipulationMessages.delete(userId);
                    await interaction.editReply({ content: 'Manipulation message deleted successfully.' });
                } else {
                    await interaction.editReply({ content: 'No manipulation message found for you.' });
                }
            } catch (error) {
                console.error('Error deleting manipulation message:', error);
                await interaction.editReply({ content: 'There was an error deleting the manipulation message.' });
            }
        }
    },
};