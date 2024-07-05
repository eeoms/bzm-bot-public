const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { scrapeManipulate } = require('../utils/scraper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get information about a specific item')
        .addStringOption(option =>
            option.setName('item').setDescription('The item to get information about').setRequired(true)
        ),
    async execute(interaction) {
        const item = interaction.options.getString('item');

        await interaction.deferReply();

        const itemsData = await scrapeManipulate([item]);

        if (itemsData.length === 0) {
            await interaction.editReply(`Item not found: ${item}. It may not be on the manipulation page.`);
        } else {
            const { itemName, imageUrl, partial } = itemsData[0];
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle(`Info for *${itemName}*`)
                .setURL(`https://www.skyblock.bz/product/${itemName.toUpperCase().replace(/ /g, '_')}`)
                .setDescription('This item is listed on the manipulate site.')
                .setThumbnail(imageUrl)
                .addFields(
                    { name: 'Buyout Price', value: `${partial.buyoutPrice}`, inline: false },
                    { name: 'Average Buy Price', value: `${partial.averageBuyPrice}`, inline: false },
                    { name: 'Amount of Items', value: `${partial.amountOfItems}`, inline: false },
                    { name: 'Post-Buyout Price', value: `${partial.postBuyoutPrice}`, inline: false },
                    { name: 'Risk', value: `${partial.risk}`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Skyblock Bazaar', iconURL: 'https://cdn.discordapp.com/attachments/1241982052719529985/1242353995075289108/BZM_Logo.webp?ex=664d87d2&is=664c3652&hm=f14011d75715a4933569dbf83bc01ba14a6839a76e0069db14013e3c7557ae17&' });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};