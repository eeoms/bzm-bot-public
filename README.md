<img src="[https://example.com/image.jpg](https://cdn.discordapp.com/attachments/1246898098219778220/1265160485011980400/Slime_Bot13.png?ex=66a08005&is=669f2e85&hm=429f183ad0a0b8b547cef87895231de756c9d332c72da5bfc8a53f6f762a1072&)" alt="Alt text" width="500" height="300">

# BZM Bot Setup Guide

This guide will walk you through the steps to set up your Discord bot from scratch. Follow each step carefully to ensure everything is set up correctly.

## Table of Contents

1. [Creating a Discord Bot](#creating-a-discord-bot)
2. [Downloading and Extracting the Code](#downloading-and-extracting-the-code)
3. [Setting Up Your Development Environment](#setting-up-your-development-environment)
4. [Opening the Project in VS Code](#opening-the-project-in-vs-code)
5. [Creating a MongoDB Database](#creating-a-mongodb-database)
6. [Configuring the Bot](#configuring-the-bot)
7. [Running the Bot](#running-the-bot)
8. [Additional Steps](#additional-steps)

## Creating a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click on "New Application" and give your bot a name.
3. Navigate to the "Bot" tab and click "Add Bot".
4. Under "TOKEN", click "Copy". Keep this token safe as you'll need it later.
5. Note down the `clientId` from the "General Information" tab.

## Downloading and Extracting the Code

1. Download the bot's code from the provided repository or source.
2. Extract the downloaded zip file to a location of your choice.

## Setting Up Your Development Environment

1. Download and install [Visual Studio Code (VS Code)](https://code.visualstudio.com/).
2. Download and install [Node.js](https://nodejs.org/), which includes npm (Node Package Manager).

## Opening the Project in VS Code

1. Open VS Code.
2. Click on "File" -> "Open Folder..." and navigate to the folder where you extracted the bot's code.
3. Open the folder.

## Creating a MongoDB Database

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up or log in.
2. Create a new cluster and database.
3. Make sure to create a user with the correct permissions and get the connection string. You'll need this for your bot's configuration.

## Configuring the Bot

1. In the VS Code explorer, find the `config.json` file and open it.
2. Fill out the following details:
    ```json
    {
        "botToken": "YOUR_DISCORD_BOT_TOKEN",
        "mongoUri": "YOUR_MONGODB_CONNECTION_STRING",
        "guildId": "YOUR_DISCORD_GUILD_ID",
        "clientId": "YOUR_DISCORD_CLIENT_ID",
        "manipulationChannel": "CHANNEL_ID_FOR_MANIPULATION_NOTIFICATIONS",
        "onlineStatusChannel": "CHANNEL_ID_FOR_ONLINE_STATUS_NOTIFICATIONS",
        "hypixelApiKey": "YOUR_HYPIXEL_API_KEY"
    }
    ```
    - `botToken`: Your Discord bot token from the Developer Portal.
    - `mongoUri`: Your MongoDB connection string.
    - `guildId`: Your Discord server (guild) ID.
    - `clientId`: Your Discord bot client ID.
    - `manipulationChannel`: The ID of the channel for manipulation notifications.
    - `onlineStatusChannel`: The ID of the channel for online status notifications.
    - `hypixelApiKey`: Your Hypixel API key.
3. Save the file.

## Running the Bot

1. Open a terminal in VS Code by clicking "Terminal" -> "New Terminal".
2. Run `npm install` to install all necessary dependencies.
3. Once the dependencies are installed, run the bot with the command `node .`.

## Additional Steps

### Adding Bot to a Server

1. Go back to the Discord Developer Portal.
2. Navigate to the "OAuth2" tab.
3. Under "OAuth2 URL Generator", select `bot` and `applications.commands` in the scopes section.
4. In the "Bot Permissions" section, select the necessary permissions your bot needs.
5. Copy the generated URL, paste it into your browser, and invite the bot to your server.

### Setting Up Environment Variables

Instead of hardcoding sensitive information in `config.json`, consider using environment variables. Create a `.env` file in your project root and add the following:
