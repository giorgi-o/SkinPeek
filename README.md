# SkinPeek

**The best discord shop bot.** Easy to use, featureful, and battle-tested.  
See your daily VALORANT item shop without launching the game, set alerts for skins, and much more.

![image](https://user-images.githubusercontent.com/20621396/153754892-2be9dff0-19e7-4cc3-976b-713c327b440b.png)  
![image](https://user-images.githubusercontent.com/20621396/153755071-62ffe0f5-ae36-4aa7-924c-b2ffd9e4dc1b.png)


<details>
<summary>See some more screenshots</summary>

![image](https://user-images.githubusercontent.com/20621396/155337379-f9435975-2b6e-44fa-8bd4-9dd8413b5622.png)  
![image](https://user-images.githubusercontent.com/20621396/155331133-6f078c13-eabb-4617-a5af-0e1339360c42.png)  
![image](https://user-images.githubusercontent.com/20621396/155335268-6540b345-c08d-4252-ba31-725d216da880.png)  
![image](https://user-images.githubusercontent.com/20621396/165736062-08c3270f-fde8-4cfa-9fca-f11005f0d250.png)  
![image](https://user-images.githubusercontent.com/20621396/155335737-6df6c650-212c-47b3-838b-18a9a15b3f94.png)

</details>

## Features

- Login using `/login`
- See your daily shop using `/shop`
- See featured bundles using `/bundles`
- See your night market using `/nightmarket`
- See your battlepass progress using `/battlepass`
- Set alerts using `/alert`
- Manage your alerts using `/alerts`
- See your shop statistics using `/stats`
- Show your VALORANT Points & Radianite using `/balance`

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `applications.commands` scope
- Install [node.js](https://nodejs.org/en/) v16.6 or newer
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo, rename the `config.json.example` file to `config.json` and put your bot token into it.
- [Open a command prompt in the same folder](https://www.thewindowsclub.com/how-to-open-command-prompt-from-right-click-menu#:~:text=To%20open%20a%20command%20prompt%20window%20in%20any%20folder%2C%20simply,the%20same%20inside%20any%20folder.) and type `npm i` to install dependencies
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js`
- Give the bot a [role](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ) that allows it to send messages and create custom emojis
- Send `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.

If you deployed both globally and in a guild, you will see every command twice. In that case, just send `!undeploy guild`!

By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using [your auth.riotgames.com cookies](https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies) using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever is hosting the bot, as they can theoretically do anything with your account.

### Docker

For advanced users who want to deploy the bot using [Docker](https://www.docker.com/):

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `applications.commands` scope
- Create a docker-compose file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/docker-compose.yml) and a config file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.
- Send `!deploy guild` to deploy in the current guild or `!deploy global` to deploy the commands globally.
 

## Future Improvements

* ~~Balance~~
* ~~Auto fetch skins on startup~~
* ~~Skin notifier/reminder~~
* ~~Show weapon rarity~~
* ~~Auto check for new Valorant version~~
* ~~See current bundles~~
* ~~See battlepass progress~~ (thanks muckelba!)
* ~~Localization support~~
* ~~Shop statistics~~
* Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
* Option to send shop automatically every day
* Admin commands (delete user, see/edit everyone's alerts, etc.)

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the idea and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for the skin names and images
- [muckelba](https://github.com/muckelba) for writing the battlepass calculator
- [Spirit](https://github.com/SpiritLetsPlays) for his [API](https://docs.valtracker.gg/bundles) for getting past bundle items and prices
- [warriorzz](https://github.com/warriorzz) for setting up the Docker
- [The discord server](https://discord.gg/a9yzrw3KAm), join here!

## Translations

If you are fluent in another language and would like help translate the bot, please do!

1. [Fork the repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
2. Look up the language code for your language [here](https://discord.com/developers/docs/reference#locales)
3. In the `languages` folder of your forked repo, copy `en-GB.json` and rename it to your language code
4. Open that file and do the thing
5. Open a pull request

Alternatively, you can just send me the JSON on discord and I'll upload it for you.

Thank you! :)
