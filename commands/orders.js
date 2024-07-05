const { SlashCommandBuilder } = require('discord.js');
const { scrapeOrders, getImage } = require('../utils/scraper');
var Table = require('easy-table');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('orders')
        .setDescription('Fetches orders for a specified item from Skyblock Bazaar')
        .addStringOption(option =>
            option.setName('item').setDescription('The item to fetch orders for').setRequired(true)
        ),
    async execute(interaction) {
        const item = interaction.options.getString('item');

        await interaction.deferReply();

        try {
            const orders = await scrapeOrders(item);
            const imageUrl = await getImage(item);

            if (orders.length === 0) {
                await interaction.editReply(`No orders found for item: ${item}.`);
                return;
            }

            var t = new Table;

            function formatNumber(num) {
                if (num >= 1000000) {
                    return (num / 1000000).toFixed(1) + 'm';
                } else if (num >= 1000) {
                    return (num / 1000).toFixed(1) + 'k';
                } else {
                    return num.toString();
                }
            }

            orders.forEach(function (order) {
                const unitPrice = parseFloat(order.unitPrice.replace(/[^\d.-]/g, ''));
                const coinEquivalent = parseFloat(order.coinEquivalent.replace(/[^\d.-]/g, ''));

                t.cell('Orders', formatNumber(order.orders));
                t.cell('Amount', formatNumber(order.amount));
                t.cell('Unit Price', formatNumber(unitPrice));
                t.cell('Coin Equivalent', formatNumber(coinEquivalent));
                t.newRow();
            });

            const tableOutput = t.toString();

            const responseMessage = `**Orders for ${item}**\n\`\`\`\n${tableOutput}\n\`\`\``;

            await interaction.editReply(responseMessage);
        } catch (error) {
            console.error('Error fetching orders:', error);
            await interaction.editReply('There was an error fetching orders for the item.');
        }
    },
};