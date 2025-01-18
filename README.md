<hr>

<h1 align="center">SkinPeek</h1>
  
<p align="center">
  <a href="#features">Features</a> |
  <a href="#installation">Installation</a> |
  <a href="#useful-information">Useful Info</a> |
  <a href="#acknowledgements">Acknowledgements</a> |
  <a href="#translations">Translations</a>
</p>

<p align="center">
  Discord bot to view your Valorant daily shop, set alerts for specific skins, and much more. 
</p>
  
<p align="center">
  Simple to setup, easy to use, and packed with useful features.
</p>
  
<p align="center">
  <img src="https://github.com/giorgi-o/SkinPeek/assets/20621396/abfc3615-0baa-403d-a914-472e0311e76b" alt="skinpeeklogo" width="150">
</p>

<p align="center">
  Feel free to join the <a href="https://discord.gg/cutBUa3j4M">support server</a> if you need any help!
</p>
<hr>

## Screenshots

![image](https://github.com/giorgi-o/SkinPeek/assets/20621396/333d872d-43f1-4578-b58b-d797020c0a23)
![image](https://user-images.githubusercontent.com/20621396/229211674-0ab4ae95-0889-4f43-a446-69887ca664e3.png)

<details>
<summary>See some more screenshots</summary>

<img src="https://user-images.githubusercontent.com/20621396/184029778-cc9e0306-8e23-4948-9d1d-5fe0db5d7e76.png" alt="nightmarket" width="501" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029833-5abc2141-0876-41f5-9f0d-5d137f548472.png" alt="stats" width="556" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029864-97c8d7c9-ba21-49f6-9777-1054f6dc9bee.png" alt="reaverstats" width="389" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029894-6222e1ed-1536-42f0-bcf4-156a6ea3db06.png" alt="balance" width="284" ><br>
<img src="https://user-images.githubusercontent.com/20621396/184029907-6df0e9af-a9aa-494c-9577-a4d57cfe5622.png" alt="battlepass" width="504" ><br>
<img src="https://user-images.githubusercontent.com/20621396/186977298-d668c22c-ccfa-441a-82d9-f7430fe14e25.png" alt="collection" width="506" ><br>


</details>

## Features

- 🔍 See your shop, bundles and night market easily without lauching the game
- 🔔 Set skin alerts to be notified automatically when they are in your shop
- 📬 Send your shop automatically every day in a text channel of your choice
- 🔀 Account switcher to check the shop and set alerts for up to 10 different accounts
- 📊 Automatically track which skins appear the most in your shop
- 👀 Fetch and see the shop of your friends using the bot
- ✔ Automatically imports new skins from the latest Valorant updates
- ⬛ Hide your Valorant username from the message using `/settings`
- 🌍 Skin names are automatically translated to any language that Valorant supports
- ✨ ...and so much more!
- 🛠 For bot admins:
  - Really easy to set up
  - Optimised for performance and reliability
  - Highly configurable in `config.json`
  - Login queue and shop cache systems to prevent rate limiting
  - Fully supports sharding (required for 2500+ servers)
  

## Installation

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `bot` and `applications.commands` scope
- Install [Node.js](https://nodejs.org/en/) v16.6 or newer
- Clone/[Download](https://github.com/giorgi-o/SkinPeek/archive/refs/heads/master.zip) the repo, rename the `config.json.example` file to `config.json` and put your bot token into it.
- [Open a command prompt in the same folder](https://www.thewindowsclub.com/how-to-open-command-prompt-from-right-click-menu#:~:text=To%20open%20a%20command%20prompt%20window%20in%20any%20folder%2C%20simply,the%20same%20inside%20any%20folder.) and type `npm i` to install dependencies
- Run [SkinPeek.js](https://github.com/giorgi-o/SkinPeek/blob/master/SkinPeek.js) using `node SkinPeek.js` in the command prompt
- And that's it! Don't forget too give the bot a [role](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ) that allows it to send messages and create custom emojis.
- Also note that you need to keep the window open for the bot to stay online. If you want it to run 24/7, consider using a [VPS](https://github.com/giorgi-o/SkinPeek/wiki/SkinPeek-Admin-Guide#which-vps-should-i-use).

## Useful Information

- [Can I get banned for using SkinPeek?](https://github.com/giorgi-o/SkinPeek/wiki/Can-I-get-banned-for-using-SkinPeek%3F) (spoiler: nope, it's safe to use!)

- After installing, the bot should automatically deploy the slash commands globally. If they don't appear:
  - If you're getting `DiscordAPIError: Missing Access`, you probably forgot to add the `applications.commands` scope in step 1
  - Discord global commands can take up to 1h to update due to caching. If you don't want to wait, send `@bot !deploy guild` in a text channel the bot can see (`@bot` being you @mentionning your bot). This will deploy the commands immediately in that guild.
  - If you see every command twice, just send `@bot !undeploy guild`!

- By default, the bot doesn't store your username/password, it only uses them to get the cookies that can be used to generate access tokens needed to get your shop.  
  - Your cookies are only stored on your hard drive, and are only ever sent to official Riot servers.
  - You can log in using your [cookies](https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies) using `/cookies` to avoid sending your password, and you can delete your account from the bot anytime using `/forget`.  

- Once you're more or less familiar with how the bot works, you should read the [Admin Guide](https://github.com/giorgi-o/SkinPeek/wiki/SkinPeek-Admin-Guide) for advanced usage and tips & tricks for hosting the bot.

- If you're bored, check out [this writeup](https://gist.github.com/giorgi-o/e0fc2f6160a5fd43f05be8567ad6fdd7) on how Riot treats third-party projects like this one.

### Docker

For advanced users who want to deploy the bot using [Docker](https://www.docker.com/):

- [Create a discord bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot) and [add it to your server](https://discordjs.guide/preparations/adding-your-bot-to-servers.html#creating-and-using-your-invite-link) with the `bot` and `applications.commands` scope
- Create a docker-compose file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/docker-compose.yml) and a config file like [this](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Put your bot token in [config.json](https://github.com/giorgi-o/SkinPeek/blob/master/config.json.example)
- Use `docker-compose up -d` to start the bot, `docker-compose logs -f` to see the logs and `docker-compose down` to stop it.


## Acknowledgements

- [Hamper](https://github.com/OwOHamper/) for the inspiration and [the code](https://github.com/OwOHamper/Valorant-item-shop-discord-bot/blob/main/item_shop_viewer.py) showing how to do it
- [Valorant-api](https://dash.valorant-api.com/) for the skin names and images
- [muckelba](https://github.com/muckelba) for writing the battlepass calculator
- [warriorzz](https://github.com/warriorzz) for setting up the Docker
- [The dev discord server](https://discord.gg/a9yzrw3KAm), join here!

Special thanks to [Mistral](https://github.com/blongnh), [Jukki](https://github.com/Kyedae) and [Keny](https://github.com/pandakeny) for their countless bug reports, suggestions and feedback, and without whom the bot wouldn't be anywhere near as good as what it is today.

## Translations

If you are fluent in another language and would like help translate the bot, either to a new language or to improve an existing translation, please do!

1. Look up the language code for your language [here](https://discord.com/developers/docs/reference#locales) or [here](http://www.lingoes.net/en/translator/langcode.htm).
2. Look in this repo's `languages` folder.
3. If your language is already there, feel free to improve and modify it as much as you can!
4. Otherwise if you're starting from scratch, copy the `en-GB.json` and rename it to your language code.

Once you're done translating, you can either [fork the repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo) and [open a GitHub pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request), or you can just send me the JSON on discord and I'll upload it for you (with credit, of course).

Thank you! ❤️
