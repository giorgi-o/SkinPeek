import {Client, Intents} from "discord.js";
import {getSkinOffers} from "./Valorant/skins.js";
import {deleteUser, getUser, redeemCookies, redeemUsernamePassword} from "./Valorant/auth.js";
import {loadConfig} from "./config.js";
import {VPEmojiString} from "./emoji.js";

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]});

const VAL_COLOR_1 = 0xFD4553, VAL_COLOR_2 = 0x0F1923;

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const commands = [
    {
        name: "skins", // might change it to /shop
        description: "Show your current daily shop"
    },
    {
        name: "login",
        description: "Log in with your Riot username/password. Your password is immediately deleted and not stored.",
        options: [
            {
                type: "STRING",
                name: "username",
                description: "Your Riot username",
                required: true
            },
            {
                type: "STRING",
                name: "password",
                description: "Your Riot password",
                required: true
            },
        ]
    },
    {
        name: "cookies",
        description: "Log in with your cookies. Useful if you have 2FA or if you use Google/Facebook to log in.",
        options: [{
            type: "STRING",
            name: "cookies",
            description: "Your auth.riotgames.com cookie header",
            required: true
        }]
    },
    {
        name: "forget",
        description: "Forget and permanently delete your account from the bot"
    }
];

client.on("messageCreate", async (message) => {
    if(message.content === "!deploy guild") {
        console.log("deploying commands...");

        const guild = client.guilds.cache.get(message.guild.id);
        await guild.commands.set(commands).then(() => console.log(`Commands deployed in guild ${message.guild.name}!`));

        await message.reply("Deployed in guild!");
    } else if(message.content === "!deploy global") {
        console.log("deploying commands...");

        await client.application.commands.set(commands).then(() => console.log("Commands deployed globally!"));

        await message.reply("Deployed globally!");
    }
});

client.on("interactionCreate", async (interaction) => {
    if(interaction.isCommand()) {
        console.log(`${interaction.user.tag} used /${interaction.commandName}`);
        switch (interaction.commandName) {
            case "skins": {
                const valorantUser = getUser(interaction.user.id)
                if(!valorantUser) return await interaction.reply({
                    embeds: [{
                        description: "You're not registered with the bot! Try `/login`.",
                        color: VAL_COLOR_1
                    }],
                    ephemeral: true
                });

                // start uploading emoji now
                const emojiPromise = VPEmojiString(interaction.guild);

                await interaction.deferReply();

                const shop = await getSkinOffers(interaction.user.id);
                if(!shop) return await interaction.followUp({
                    embeds: [{
                        description: "Could not fetch your shop, most likely you got logged out. Try logging in again.",
                        color: VAL_COLOR_1
                    }],
                    ephemeral: true
                });

                const embeds = [{
                    description: `Daily shop for **${valorantUser.username}** (new shop <t:${Math.floor(Date.now() / 1000) + shop.expires}:R>)`,
                    color: VAL_COLOR_1
                }];

                const emojiString = (await emojiPromise) || "Price:";

                for(const item of shop.offers) {
                    const embed = {
                        title: item.name,
                        color: VAL_COLOR_2,
                        thumbnail: {
                            url: item.icon
                        }
                    };
                    if(config.showSkinPrices && item.price) embed.description = `${emojiString} ${item.price}`;
                    embeds.push(embed);
                }

                await interaction.followUp({embeds});
                break;
            }
            case "login": {
                await interaction.deferReply({ephemeral: true});

                const username = interaction.options.get("username").value;
                const password = interaction.options.get("password").value;

                const success = await redeemUsernamePassword(interaction.user.id, username, password);

                const user = getUser(interaction.user.id);
                let embed;
                if(success && user) {
                    console.log(`${interaction.user.tag} logged in as ${user.username} using cookies`);
                    embed = basicEmbed(`Successfully logged in as **${user.username}**!`);
                }
                else {
                    console.log(`${interaction.user.tag} login failed`);
                    embed = basicEmbed("Invalid username or password!");
                }

                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true
                });

                break;
            }
            case "cookies": {
                await interaction.deferReply({ephemeral: true});

                const cookies = interaction.options.get("cookies").value;

                const success = await redeemCookies(interaction.user.id, cookies);

                const user = getUser(interaction.user.id);
                let embed;
                if(success && user) {
                    console.log(`${interaction.user.tag} logged in as ${user.username}`)
                    embed = basicEmbed(`Successfully logged in as **${user.username}**!`);
                }
                else {
                    console.log(`${interaction.user.tag} login failed`)
                    embed = basicEmbed("Whoops, that didn't work! Are your cookies formatted correctly?");
                }

                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true
                });

                break;
            }
            case "forget": {
                const user = getUser(interaction.user.id);
                if(!user) return await interaction.reply({embeds: [basicEmbed("I can't forget you if you're not registered!")], ephemeral: true});

                deleteUser(interaction.user.id);
                console.log(`${interaction.user.tag} deleted their account`);

                await interaction.reply({embeds: [basicEmbed("Your account has been deleted from the database!")], ephemeral: true});
                break;
            }
            default: {
                await interaction.reply("Yer a wizard harry!");
                break;
            }
        }
    }
});

const basicEmbed = (content) => {
    return {
        description: content,
        color: VAL_COLOR_1
    }
}

const config = loadConfig();
if(config) {
    client.login(config.token);
    console.log("Logging in...")
}
