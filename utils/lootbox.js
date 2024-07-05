const { EmbedBuilder } = require('discord.js');

let activeLootbox = null;
const entries = new Map();
const lootboxRewards = {
    common: { min: 5, max: 10 },
    uncommon: { min: 7, max: 15 },
    rare: { min: 16, max: 22 },
    epic: { min: 25, max: 40 },
    legendary: { min: 35, max: 60 },
    mythic: { min: 60, max: 100 },
    coin: 20,
};

const rarityChances = {
    common: 40,
    uncommon: 20,
    rare: 15,
    epic: 10,
    legendary: 5,
    mythic: 4,
    coin: 6,
};

function getRandomRarity() {
    const totalChance = Object.values(rarityChances).reduce((acc, chance) => acc + chance, 0);
    const random = Math.floor(Math.random() * totalChance);
    let accumulatedChance = 0;

    for (const [rarity, chance] of Object.entries(rarityChances)) {
        accumulatedChance += chance;
        if (random < accumulatedChance) {
            return rarity;
        }
    }
}

function spawnLootbox() {
    if (activeLootbox) return;

    const rarity = getRandomRarity();
    activeLootbox = {
        rarity,
        entries: new Map(),
    };

    return rarity;
}

function enterLootbox(user, role) {
    if (!activeLootbox) return 'No active lootbox.';

    const multipliers = {
        spawner: 3,
        booster: 1.5,
        normal: 1,
        staff: 1.5,
        omega: 2,
    };

    let entryMultiplier = multipliers.normal;
    if (role in multipliers) {
        entryMultiplier = multipliers[role];
    }

    const currentEntries = activeLootbox.entries.get(user.id) || 0;
    activeLootbox.entries.set(user.id, currentEntries + entryMultiplier);

    if (activeLootbox.entries.size >= 10) {
        const result = determineWinner();
        activeLootbox = null;
        return result;
    }

    return `You have entered the lootbox with a ${entryMultiplier}x multiplier.`;
}

function determineWinner() {
    const totalEntries = Array.from(activeLootbox.entries.values()).reduce((acc, entries) => acc + entries, 0);
    const winningEntry = Math.floor(Math.random() * totalEntries);
    let accumulatedEntries = 0;

    for (const [userId, entries] of activeLootbox.entries.entries()) {
        accumulatedEntries += entries;
        if (winningEntry < accumulatedEntries) {
            const reward = getReward(activeLootbox.rarity);
            return { winner: userId, reward };
        }
    }
}

function getReward(rarity) {
    if (rarity === 'coin') {
        return lootboxRewards.coin;
    } else {
        const { min, max } = lootboxRewards[rarity];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

module.exports = { spawnLootbox, enterLootbox };