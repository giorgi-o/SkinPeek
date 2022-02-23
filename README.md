# SkinPeek
Discord bot to see your daily Valorant item shop without launching the game, set alerts for skins, and much more.

![image](https://user-images.githubusercontent.com/20621396/153754892-2be9dff0-19e7-4cc3-976b-713c327b440b.png)  
![image](https://user-images.githubusercontent.com/20621396/153755071-62ffe0f5-ae36-4aa7-924c-b2ffd9e4dc1b.png)
## Features

- Login using `/login`
- See your daily shop using `/shop`
- See featured bundles using `/bundles`
- See your night market using `/nightmarket`
- See your battlepass progress using `/battlepass`
- Set alerts using `/alert`
- Manage your alerts using `/alerts`
- Show your Valorant Points & Radianite using `/balance`

## Screenshots

<details>
<summary>See some more screenshots</summary>

![image](https://user-images.githubusercontent.com/20621396/155337379-f9435975-2b6e-44fa-8bd4-9dd8413b5622.png)  
![image](https://user-images.githubusercontent.com/20621396/155331133-6f078c13-eabb-4617-a5af-0e1339360c42.png)  
![image](https://user-images.githubusercontent.com/20621396/155335268-6540b345-c08d-4252-ba31-725d216da880.png)  
![image](https://user-images.githubusercontent.com/20621396/155335737-6df6c650-212c-47b3-838b-18a9a15b3f94.png)

</details>

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `applications.commands` scope
- Install [node.js](https://nodejs.org/en/) v16.6 or newer
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo, rename the `config.json.example` file to `config.json` and put your bot token into it.
- Install the dependencies in the same folder using `npm i`
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js`
- Give the bot a [role](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ) that allows it to send messages and create custom emojis
- Send `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.

If you deployed both globally and in a guild, you will see every command twice. In that case, just send `!undeploy` and `!deploy global`.

By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using [your auth.riotgames.com cookies](https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies) using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever is hosting the bot, as they can theoretically do anything with your account.

### Docker

For advanced users who want to deploy the bot using [Docker](https://www.docker.com/):

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `applications.commands` scope
- Create a docker-compose file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/docker-compose.yml) and a config file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.
- Send `!deploy guild` or `!deploy global` to deploy the commands.
 

## Future Improvements

* ~~Balance~~
* ~~Auto fetch skins on startup~~
* ~~Skin notifier/reminder~~
* ~~Show weapon rarity~~
* ~~Auto check for new Valorant version~~
* ~~See current bundles~~
* ~~See battlepass progress~~ (thanks muckelba!)
* Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
* Option to send shop automatically every day
* Admin commands (delete user, see/edit everyone's alerts, etc.)

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the idea and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for the skin names and images
- [muckelba](https://github.com/muckelba) for writing the battlepass calculator
- [warriorzz](https://github.com/warriorzz) for setting up the Docker
- [The discord server](https://discord.gg/a9yzrw3KAm), join here!
