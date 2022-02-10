# SkinPeek
Discord bot to see your daily Valorant item shop without launching the game and set alerts for skins.

<img src="https://user-images.githubusercontent.com/20621396/148746123-445eca70-1afe-43bc-9c2f-8242a557ec86.png" alt="/shop demo" width="400" />
<img src="https://user-images.githubusercontent.com/20621396/148747282-42e49099-a4be-4569-b812-4ec09564f897.png" alt="alert demo" width="600" />

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links) with the `applications.commands` scope
- Install [node.js](https://nodejs.org/en/) v16.6 or newer
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo and put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- Install the dependencies in the same folder using `npm i`
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js`
- Send `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.

If you deployed both globally and in a guild, you will see every command twice. In that case, just send `!undeploy` and `!deploy global`.

### Docker

For advanced users who want to deploy the bot using [Docker](https://www.docker.com/):

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#bot-invite-links) with the `applications.commands` scope
- Create a docker-compose file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/docker-compose.yml) and a config file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- Put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json)
- Login to [ghcr.io]() (`docker login ghcr.io`) using your GitHub username and a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `write:packages` permission
- Use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.
- Send `!deploy guild` or `!deploy global` to deploy the commands.

## Usage

The bot should have role that allows it to send messages and create custom emojis.

- Login using `/login`
- Get your daily shop using `/shop`
- Get featured bundles using `/bundles`
- See your night market using `/nightmarket`
- Set alerts using `/alert`
- Manage your alerts using `/alerts`
- Show your Valorant Points & Radianite using `/balance`
- See battlepass progress using `/battlepass`

By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using [your auth.riotgames.com cookies](https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies) using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever is hosting the bot, as they can theoretically do anything with your account.  

## Future Improvements

* ~~Balance~~
* ~~Auto fetch skins on startup~~
* ~~Skin notifier/reminder~~
* ~~Show weapon rarity~~
* ~~Auto check for new Valorant version~~
* ~~See current bundles~~
* Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
* Option to send shop automatically every day
* Admin commands (delete user, see/edit everyone's alerts, etc.)

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the idea and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for skin names and images
- [warriorzz](https://github.com/warriorzz) for setting up the Docker
- [The discord server](https://discord.gg/a9yzrw3KAm), join here!
