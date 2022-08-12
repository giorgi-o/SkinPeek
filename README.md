# SkinPeek

View your Valorant daily shop from the comfort of your bed, set alerts for skins, and much more.  
Easy to use, has many features, and used by small & large bots alike.  

<img src="https://user-images.githubusercontent.com/20621396/184029573-588c84aa-e183-409c-9452-e8d13028c228.png" alt="shop" width="504" >  
<img src="https://user-images.githubusercontent.com/20621396/184029594-18d59bc6-7a54-48c8-89fc-d89aac76b180.png" alt="alert" width="633" >


<details>
<summary>See some more screenshots</summary>

<img src="https://user-images.githubusercontent.com/20621396/184029778-cc9e0306-8e23-4948-9d1d-5fe0db5d7e76.png" alt="nightmarket" width="501" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029833-5abc2141-0876-41f5-9f0d-5d137f548472.png" alt="stats" width="556" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029864-97c8d7c9-ba21-49f6-9777-1054f6dc9bee.png" alt="reaverstats" width="389" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029894-6222e1ed-1536-42f0-bcf4-156a6ea3db06.png" alt="balance" width="284" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029907-6df0e9af-a9aa-494c-9577-a4d57cfe5622.png" alt="battlepass" width="504" ><br>


</details>

Feel free to join the [support server](https://discord.gg/yx5sPJxWth) for any help with the bot or if you want to use a public instance without hosting it yourself!

## Features

- 🔍 See your shop, bundles and night market easily and without lauching the game
- 🔔 Set skin alerts to be notified automatically when they are in your shop
- 🔀 Account switcher to check the shop and set alerts for multiple accounts
- 📋 Automatically track skin occurence stats
- 👀 See the shop of your friends using the bot (can be disabled)
- ⬛ Hide your Valorant username from the message using `/settings`
- ✔ Automatically imports new skins from Valorant updates
- 🌍 Skin names are automatically translated to any language that Valorant supports
- 🛠 For bot admins:
  - Easy to setup, highly configurable in `config.json`
  - Optimised for reliability and performance
  - Toggleable login and shop queues to prevent rate limiting
  - Shop cache to prevent fetching the same user's shop twice
  - Used by large shop bots, highly scalable
  - Fully supports sharding (required for 2500+ servers)
  

## Installation

[![Run on Repl.it](https://replit.com/badge/github/Gam3rBoy57/SkinPeekReplit)](https://replit.com/github/Gam3rBoy57/SkinPeekReplit)
- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `bot` and `applications.commands` scope
- Install [Node.js](https://nodejs.org/en/) v16.6 or newer
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo, rename the `config.json.example` file to `config.json` and put your bot token into it.
- [Open a command prompt in the same folder](https://www.thewindowsclub.com/how-to-open-command-prompt-from-right-click-menu#:~:text=To%20open%20a%20command%20prompt%20window%20in%20any%20folder%2C%20simply,the%20same%20inside%20any%20folder.) and type `npm i` to install dependencies
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js` in the command prompt
- Give the bot a [role](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ) that allows it to send messages and create custom emojis
- Send `!deploy guild` or `!deploy global` to deploy the commands.

Deploying in the guild happens instantly but the commands can only be used in that guild. Deploying globally can take up to an hour due to Discord's caching.  
If you deployed both globally and in a guild, you will see every command twice. In that case, just send `!undeploy guild`!

By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
You can log in using [your auth.riotgames.com cookies](https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies) using `/cookies` to avoid sending your password, and you can delete your account from the bot using `/forget`.  
Obviously, only log in if you trust whoever is hosting the bot, as they can theoretically do anything with your account.

If you're bored, check out [this writeup](https://gist.github.com/giorgi-o/e0fc2f6160a5fd43f05be8567ad6fdd7) on how Riot treats third-party projects like this one.

### Docker

For advanced users who want to deploy the bot using [Docker](https://www.docker.com/):

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the  bot and `applications.commands` scope
- Create a docker-compose file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/docker-compose.yml) and a config file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.
- Send `!deploy guild` to deploy in the current guild or `!deploy global` to deploy the commands globally.
 

## Future Improvements

* ~~Auto check for new Valorant version~~
* ~~View balance~~
* ~~Auto fetch skin data on startup~~
* ~~Skin notifier/reminder~~
* ~~Show weapon rarity~~
* ~~See current bundles~~
* ~~See battlepass progress~~ (thanks muckelba!)
* ~~Localization support~~
* ~~Shop statistics~~
* ~~Settings menu~~
* ~~View other people's shops~~
* Option to send shop automatically every day
* Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
* Show off your skin collection & account value
* Admin commands (delete user, see/edit everyone's alerts, etc.)

## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the idea and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for the skin names and images
- [muckelba](https://github.com/muckelba) for writing the battlepass calculator
- [Spirit](https://github.com/SpiritLetsPlays) for his [API](https://docs.valtracker.gg/bundles) for getting past bundle items and prices
- [warriorzz](https://github.com/warriorzz) for setting up the Docker
- [The dev discord server](https://discord.gg/a9yzrw3KAm), join here!

## Translations

If you are fluent in another language and would like help translate the bot, please do!

1. Look up the language code for your language [here](https://discord.com/developers/docs/reference#locales)
2. Look in the bot's `languages` folder
3. If you're starting from scratch, copy the `en-GB.json` file and rename it to your language code
4. Open the file and do the thing

Once you're done translating, you can either [fork the repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo) and [open a GitHub pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request), or you can just send me the JSON on discord and I'll upload it for you.

Thank you! :)
