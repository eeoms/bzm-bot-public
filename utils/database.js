const { MongoClient } = require('mongodb');
const config = require('../config.json');

let db;

async function connectToMongoDB() {
    const uri = config.mongoUri;
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db('discordBotDB');
    console.log('Connected to MongoDB');
}

function getDb() {
    return db;
}

async function getUUID(username) {
    const url = `https://api.mojang.com/users/profiles/minecraft/${username}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.id; // This is the UUID of the user
}

async function addUser(username) {
    const uuid = await getUUID(username);
    const collection = db.collection('users');
    await collection.updateOne(
        { uuid },
        { $set: { username } },
        { upsert: true }
    );
}

async function deleteUser(username) {
    const uuid = await getUUID(username);
    const collection = db.collection('users');
    await collection.deleteOne({ uuid });
}

async function getItemsFromDatabase() {
    const collection = db.collection('scrapedItems');
    const items = await collection.find().toArray();
    return items.map(item => item.name);
}

module.exports = { connectToMongoDB, getDb, addUser, deleteUser, getItemsFromDatabase };