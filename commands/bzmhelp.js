const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bzmhelp')
        .setDescription('Display help for Bazaar Maniacs commands'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Commands')
            .addFields(
                { name: '/risk start/stop', value: 'Start/stop the risk (Admin only)', inline: false },
                { name: '/risk add [item]', value: 'Add items to the risk command (Admin only)', inline: false },
                { name: '/risk delete [item]', value: 'Delete items from the risk command (Admin only)', inline: false },
                { name: '/risk list', value: 'Lists items for the risk command', inline: false },
                { name: '/check', value: 'Check for online griefers', inline: false },
                { name: '/all', value: 'Check for all griefers', inline: false },
                { name: '/add [player]', value: 'Add a griefer (Admin only)', inline: false },
                { name: '/delete [player]', value: 'Delete a griefer (Admin only)', inline: false },
                { name: '/visit', value: 'Top 10 most visited items', inline: false },
                { name: '/lottery create', value: 'Creates a lottery', inline: false },
                { name: '/godroll', value: 'Lists items sorted by risk on the manip site', inline: false },
                { name: '/info', value: 'Lists manip info for specified item', inline: false },
                { name: '/orders', value: 'Lists all orders (only items with under 30) of an item', inline: false },
            )
            .setTimestamp()
            .setFooter({ text: 'Bazaar Maniacs', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

        await interaction.reply({ embeds: [embed] });
    },
};