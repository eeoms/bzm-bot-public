const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { enterLootbox } = require('../utils/lootbox');

const roleIds = {
    booster: '1227670522494718073',
    staff: ['1246986743325130813'],
    omega: '',
};

function getRole(member) {
    if (member.roles.cache.has(roleIds.booster)) {
        return 'booster';
    } else if (roleIds.staff.some(roleId => member.roles.cache.has(roleId))) {
        return 'staff';
    } else if (member.roles.cache.has(roleIds.omega)) {
        return 'omega';
    } else {
        return 'normal';
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enter')
        .setDescription('Enter the active lootbox'),
    async execute(interaction) {
        const user = interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        const role = getRole(member);

        const result = enterLootbox(user, role);
        if (typeof result === 'string') {
            await interaction.reply(result);
        } else {
            const { winner, reward } = result;
            const embed = new EmbedBuilder()
                .setColor(0xA91313)
                .setTitle('Lootbox Result')
                .setDescription(`<@${winner}> has won the lootbox and received ${reward} million coins!`);
            await interaction.reply({ embeds: [embed] });
        }
    },
};