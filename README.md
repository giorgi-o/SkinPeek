# SkinPeek
Discord bot to see your daily Valorant item shop without launching the game.

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links) with the `applications.commands` scope
- Install [node.js](https://nodejs.org/en/)
- Clone/Download the repo and put your token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- Install [discord.js](https://discord.js.org/) in the same folder using `npm i discord.js`
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js`
- Type `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.

## Usage

- Login using `/login`
- Get your daily shop using `/skins`

The bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using your auth.riotgames.com cookies using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever's hosting the bot, as they can theoretically do anything with your account.  

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/Valorant-item-shop-discord-bot) for the idea, and the code showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for skin names and images
- [The discord server](https://discord.gg/a9yzrw3KAm), join here!
