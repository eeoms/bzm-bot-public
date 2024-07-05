const { Client, GatewayIntentBits, Collection, EmbedBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { connectToMongoDB } = require('./utils/database');
const config = require('./config.json');
const { spawnLootbox, enterLootbox } = require('./utils/lootbox');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();

// Load command files
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// Register commands to the guild
client.once('ready', async () => {
    console.log('Ready!');
    await connectToMongoDB();

    const commands = client.commands.map(cmd => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(config.botToken);

    try {
        console.log('Started refreshing guild (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );

        console.log('Successfully reloaded guild (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const chance = Math.floor(Math.random() * 10); // Adjusted chance for 1/3000
    if (chance === 0) {
        const rarity = spawnLootbox();
        const embed = new EmbedBuilder()
            .setColor(0xA91313)
            .setTitle('Lootbox Spawned!')
            .setDescription(`A **${rarity}** lootbox has spawned! Type \`/enter\` to enter the lootbox draw.`);
        message.channel.send({ embeds: [embed] });
    }
});

client.login(config.botToken);