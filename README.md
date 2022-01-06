# SkinPeek
Discord bot to see your daily Valorant item shop without launching the game and set alerts for skins.

<img src="https://user-images.githubusercontent.com/20621396/148357971-92168c7e-4caa-472d-bbd7-a3d3fff6b76d.png" alt="illustration" width="400" />
<img src="https://user-images.githubusercontent.com/20621396/148361776-ade68af6-351d-4e96-a81d-f707bc3eb28c.png" alt="illustration" width="600" />

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links) with the `applications.commands` scope
- Install [node.js](https://nodejs.org/en/)
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo and put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- Install the dependencies in the same folder using `npm i`
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js`
- Send `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.

The bot should have role that allows it to send messages and create custom emojis.

### Docker

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links) with the `applications.commands` scope
- Clone the repo and put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.
- Send `!deploy guild` or `!deploy global` to deploy the commands.

## Usage

- Login using `/login`
- Get your daily shop using `/skins`
- Set alerts using `/alert`
- Show your Valorant Points & Radianite using `/balance`

By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using your auth.riotgames.com cookies using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever is hosting the bot, as they can theoretically do anything with your account.  

## Future Improvements

* ~~Balance~~
* ~~Auto fetch skins on startup~~
* ~~Skin notifier/reminder~~
* Auto check for new Valorant version
* See current bundles
* Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
* Option to send shop automatically every day
* Admin commands (delete user, see/edit everyone's alerts, etc.)

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the idea and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for skin names and images
- [The discord server](https://discord.gg/a9yzrw3KAm), join here!
