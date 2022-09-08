import {Client, Intents, MessageActionRow, MessageFlags, MessageSelectMenu} from "discord.js";
import cron from "node-cron";

import {
    authFailureMessage,
    basicEmbed,
    renderBundle,
    secondaryEmbed,
    skinChosenEmbed,
    VAL_COLOR_1,
    botInfoEmbed,
    ownerMessageEmbed,
    alertTestResponse,
    alertsPageEmbed,
    statsForSkinEmbed,
    allStatsEmbed,
    accountsListEmbed,
    switchAccountButtons, skinCollectionPageEmbed, skinCollectionSingleEmbed, valMaintenancesEmbeds
} from "./embed.js";
import {authUser, getUser, getUserList, setUserLocale,} from "../valorant/auth.js";
import {getBalance} from "../valorant/shop.js";
import {getSkin, fetchData, searchSkin, searchBundle, getBundle} from "../valorant/cache.js";
import {
    addAlert,
    alertExists,
    alertsPerChannelPerGuild,
    checkAlerts,
    fetchAlerts,
    filteredAlertsForUser,
    removeAlert,
    testAlerts
} from "./alerts.js";
import {RadEmoji, VPEmoji} from "./emoji.js";
import {processShopQueue} from "../valorant/shopQueue.js";
import {getAuthQueueItemStatus, processAuthQueue, queueCookiesLogin,} from "../valorant/authQueue.js";
import {login2FA, loginUsernamePassword, retryFailedOperation} from "./authManager.js";
import {renderBattlepassProgress} from "../valorant/battlepass.js";
import {getOverallStats, getStatsFor} from "../misc/stats.js";
import {
    canSendMessages,
    defer,
    fetchChannel, fetchMaintenances,
    removeAlertActionRow,
    skinNameAndEmoji,
    valNamesToDiscordNames,
    wait
} from "../misc/util.js";
import config, {loadConfig, saveConfig} from "../misc/config.js";
import {sendConsoleOutput} from "../misc/logger.js";
import {DEFAULT_VALORANT_LANG, discToValLang, l, s} from "../misc/languages.js";
import {
    deleteUser,
    deleteWholeUser, findTargetAccountIndex,
    getNumberOfAccounts,
    readUserJson,
    switchAccount
} from "../valorant/accountSwitcher.js";
import {sendShardMessage} from "../misc/shardMessage.js";
import {fetchBundles, fetchNightMarket, fetchShop} from "../valorant/shopManager.js";
import {
    getSetting,
    handleSettingDropdown,
    handleSettingsSetCommand,
    handleSettingsViewCommand, settingName, settings
} from "../misc/settings.js";
import fuzzysort from "fuzzysort";
import {renderCollection} from "../valorant/inventory.js";
import {getLoadout} from "../valorant/inventory.js";

export const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS], // what intents does the bot need
    //shards: "auto" // uncomment this to use internal sharding instead of sharding.js
});
const cronTasks = [];

client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    console.log("Loading skins...");
    fetchData().then(() => console.log("Skins loaded!"));

    scheduleTasks();

    await client.user.setActivity("your store!", {type: "WATCHING"});
});

export const scheduleTasks = () => {
    console.log("Scheduling tasks...");

    // check alerts every day at 00:00:10 GMT
    if(config.refreshSkins) cronTasks.push(cron.schedule(config.refreshSkins, checkAlerts, {timezone: "GMT"}));

    // check for new valorant version every 15mins
    if(config.checkGameVersion) cronTasks.push(cron.schedule(config.checkGameVersion, () => fetchData(null, true)));

    // if login queue is enabled, process an item every 3 seconds
    if(config.useLoginQueue && config.loginQueue) cronTasks.push(cron.schedule(config.loginQueue, processAuthQueue));

    // if shop queue is enabled, process an item every second
    if(config.useShopQueue && config.shopQueue) cronTasks.push(cron.schedule(config.shopQueue, processShopQueue));

    // if send console to discord channel is enabled, send console output every 10 seconds
    if(config.logToChannel && config.logFrequency) cronTasks.push(cron.schedule(config.logFrequency, sendConsoleOutput));
}

export const destroyTasks = () => {
    console.log("Destroying scheduled tasks...");
    for(const task of cronTasks)
        task.stop();
    cronTasks.length = 0;
}

const commands = [
    {
        name: "shop",
        description: "Show your current daily shop!",
        options: [{
            type: "USER",
            name: "user",
            description: "Optional: see the daily shop of someone else!",
            required: false
        }]
    },
    {
        name: "bundles",
        description: "Show the current featured bundle(s)."
    },
    {
        name: "bundle",
        description: "Inspect a specific bundle",
        options: [{
            type: "STRING",
            name: "bundle",
            description: "The name of the bundle you want to inspect!",
            required: true,
            autocomplete: true
        }]
    },
    {
        name: "nightmarket",
        description: "Show your Night Market if there is one."
    },
    {
        name: "balance",
        description: "Show how many VALORANT Points & Radianite you have in your account!"
    },
    {
        name: "alert",
        description: "Set an alert for when a particular skin is in your shop.",
        options: [{
            type: "STRING",
            name: "skin",
            description: "The name of the skin you want to set an alert for",
            required: true,
            autocomplete: true
        }]
    },
    {
        name: "alerts",
        description: "Show all your active alerts!"
    },
    {
        name: "testalerts",
        description: "Make sure alerts are working for your account and in this channel"
    },
    {
        name: "login",
        description: "Log in with your Riot username/password!",
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
        name: "2fa",
        description: "Enter your 2FA code if needed",
        options: [{
            type: "INTEGER",
            name: "code",
            description: "The 2FA Code",
            required: true,
            minValue: 0,
            maxValue: 999999
        }]
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
        name: "settings",
        description: "Change your settings with the bot, or view your current settings",
        options: [{
                name: "view",
                description: "See your current settings",
                type: 1,
            },
            {
                name: "set",
                description: "Change one of your settings with the bot",
                type: 1,
                options: [{
                    name: "setting",
                    description: "The name of the setting you want to change",
                    type: "STRING",
                    required: true,
                    choices: Object.keys(settings).map((setting) => {return {
                        name: settingName(setting),
                        value: setting
                    }})
                }]
            }
        ]
    },
    {
        name: "forget",
        description: "Forget and permanently delete your account from the bot.",
        options: [{
            type: "STRING",
            name: "account",
            description: "The account you want to forget. Leave blank to forget all accounts.",
            required: false,
            autocomplete: true
        }]
    },
    {
        name: "collection",
        description: "Show off your skin collection!",
        options: [{
            type: "USER",
            name: "user",
            description: "Optional: see someone else's collection!",
            required: false
        }]
    },
    {
        name: "battlepass",
        description: "Calculate battlepass progression.",
        options: [{
            type: "INTEGER",
            name: "maxlevel",
            description: "Enter the level you want to reach",
            required: false,
            minValue: 2,
            maxValue: 55
        }]
    },
    {
        name: "stats",
        description: "See the stats for a skin",
        options: [{
            type: "STRING",
            name: "skin",
            description: "The name of the skin you want to see the stats of",
            required: false,
            autocomplete: true
        }]
    },
    {
        name: "account",
        description: "Switch the Valorant account you are currently using",
        options: [{
            type: "STRING",
            name: "account",
            description: "The account you want to switch to",
            required: true,
            autocomplete: true
        }]
    },
    {
        name: "accounts",
        description: "Show all of your Valorant accounts"
    },
    {
        name: "valstatus",
        description: "Check the status of your account's VALORANT servers"
    },
    {
        name: "info",
        description: "Show information about the bot"
    }
];

client.on("messageCreate", async (message) => {
    try {
        if(config.ownerId && message.author.id !== config.ownerId && message.guildId !== config.ownerId) {
            if(!message.member) return;
            if(!message.member.roles.resolve(config.ownerId)) return;
        }

        const content = message.content.replace(/<@!?\d+> ?/, ""); // remove @bot mention
        if(!content.startsWith('!')) return;
        console.log(`${message.author.tag} sent admin command ${content}`);

        if(content === "!deploy guild") {
            if(!message.guild) return;

            console.log("Deploying commands in guild...");

            await message.guild.commands.set(commands).then(() => console.log(`Commands deployed in guild ${message.guild.name}!`));

            await message.reply("Deployed in guild!");
        } else if(content === "!deploy global") {
            console.log("Deploying commands...");

            await client.application.commands.set(commands).then(() => console.log("Commands deployed globally!"));

            await message.reply("Deployed globally!");
        } else if(content.startsWith("!undeploy")) {
            console.log("Undeploying commands...");

            if(content === "!undeploy guild") {
                if(!message.guild) return;
                await message.guild.commands.set([]).then(() => console.log(`Commands undeployed in guild ${message.guild.name}!`));
                await message.reply("Undeployed in guild!");
            }
            else if(content === "!undeploy global" || !message.guild) {
                await client.application.commands.set([]).then(() => console.log("Commands undeployed globally!"));
                await message.reply("Undeployed globally!");
            }
            else {
                await client.application.commands.set([]).then(() => console.log("Commands undeployed globally!"));

                const guild = client.guilds.cache.get(message.guild.id);
                await guild.commands.set([]).then(() => console.log(`Commands undeployed in guild ${message.guild.name}!`));

                await message.reply("Undeployed in guild and globally!");
            }
        } else if(content.startsWith("!config")) {
            const splits = content.split(' ');
            if(splits[1] === "reload") {
                const oldToken = config.token;

                destroyTasks();
                saveConfig();
                scheduleTasks();

                if(client.shard) sendShardMessage({type: "configReload"});

                let s = "Successfully reloaded the config!";
                if(config.token !== oldToken)
                    s += "\nI noticed you changed the token. You'll have to restart the bot for that to happen."
                await message.reply(s);
            } else if(splits[1] === "load") {
                const oldToken = config.token;

                loadConfig();
                destroyTasks();
                scheduleTasks();

                if(client.shard) sendShardMessage({type: "configReload"});

                let s = "Successfully reloaded the config from disk!";
                if(config.token !== oldToken)
                    s += "\nI noticed you changed the token. You'll have to restart the bot for that to happen."
                await message.reply(s);
            } else if(splits[1] === "read") {
                const s = "Here is the config.json the bot currently has loaded:```json\n" + JSON.stringify({...config, token: "[redacted]"}, null, 2) + "```";
                await message.reply(s);
            } else {
                const target = splits[1];
                const value = splits.slice(2).join(' ');

                const configType = typeof config[target];
                switch (configType) {
                    case 'string':
                    case 'undefined':
                        config[target] = value;
                        break;
                    case 'number':
                        config[target] = parseFloat(value);
                        break;
                    case 'boolean':
                        config[target] = value.toLowerCase().startsWith('t');
                        break;
                    default:
                        return await message.reply("[Error] I don't know what type the config is in, so I can't convert it!");
                }

                let s;
                if(typeof config[target] === 'string') s = `Set the config value \`${target}\` to \`"${config[target]}"\`!`;
                else s = `Set the config value \`${target}\` to \`${config[target]}\`!`;
                s += "\nDon't forget to `!config reload` to apply your changes!";
                if(configType === 'undefined') s += "\n**Note:** That config option wasn't there before! Are you sure that's not a typo?"
                await message.reply(s);
            }
        } else if(content.startsWith("!message ")) {
            const messageContent = content.substring(9);
            const messageEmbed = ownerMessageEmbed(messageContent, message.author);

            const guilds = await alertsPerChannelPerGuild();

            await message.reply(`Sending message to ${Object.keys(guilds).length} guilds with alerts setup...`);

            for(const guildId in guilds) {
                const guild = client.guilds.cache.get(guildId);
                if(!guild) continue;

                try {
                    const alertsPerChannel = guilds[guildId];
                    let channelWithMostAlerts = [null, 0];
                    for(const channelId in alertsPerChannel) {
                        if(alertsPerChannel[channelId] > channelWithMostAlerts[1]) {
                            channelWithMostAlerts = [channelId, alertsPerChannel[channelId]];
                        }
                    }
                    if(channelWithMostAlerts[0] === null) continue;

                    const channel = await fetchChannel(channelWithMostAlerts[0]);
                    if(!channel) continue;

                    console.log(`Channel with most alerts: #${channel.name} (${channelWithMostAlerts[1]} alerts)`);
                    await channel.send({
                        embeds: [messageEmbed]
                    });
                } catch(e) {
                    if(e.code === 50013 || e.code === 50001) {
                        console.error(`Don't have perms to send !message to ${guild.name}!`)
                    } else {
                        console.error(`Error while sending !message to guild ${guild.name}!`);
                        console.error(e);
                    }
                }
            }

            await message.reply(`Finished sending the message!`);
        } else if(content.startsWith("!status")) {
            config.status = content.substring(8, 8 + 1023);
            saveConfig();
            await message.reply("Set the status to `" + config.status + "`!");
        } else if(content === "!forcealerts") {
            if(!client.shard || client.shard.ids.includes(0)) {
                await checkAlerts();
                await message.reply("Checked alerts!");
            }
            else {
                await sendShardMessage({type: "checkAlerts"});
                await message.reply("Told shard 0 to start checking alerts!");
            }
        }
    } catch(e) {
        console.error("Error while processing message!");
        console.error(e);
    }
});

client.on("interactionCreate", async (interaction) => {
    const valorantUser = getUser(interaction.user.id);
    if(valorantUser) setUserLocale(valorantUser, interaction.locale);

    if(interaction.isCommand()) {
        try {
            console.log(`${interaction.user.tag} used /${interaction.commandName}`);
            switch (interaction.commandName) {
                case "skins":
                case "shop": {
                    let targetUser = interaction.user;

                    const otherUser = interaction.options.getUser("user");
                    if(otherUser && otherUser.id !== interaction.user.id) {
                        const otherValorantUser = getUser(otherUser.id);
                        if(!otherValorantUser) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED_OTHER)]
                        });

                        if(!getSetting(otherUser.id, "othersCanViewShop")) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.OTHER_SHOP_DISABLED.f({u: `<@${otherUser.id}>`}))]
                        });

                        targetUser = otherUser;
                    }
                    else if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await fetchShop(interaction, valorantUser, targetUser.id);
                    await interaction.followUp(message);

                    console.log(`Sent ${targetUser.tag}'s shop!`); // also logged if maintenance/login failed

                    break;
                }
                case "bundles": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await fetchBundles(interaction);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s bundle(s)!`);

                    break;
                }
                case "bundle": {
                    await defer(interaction);

                    const searchQuery = interaction.options.get("bundle").value.replace(/collection/i, "").replace(/bundle/i, "");
                    const searchResults = await searchBundle(searchQuery, interaction.locale, 25);

                    const channel = interaction.channel || await fetchChannel(interaction.channelId);
                    const emoji = await VPEmoji(interaction, channel);

                    // if the name matches exactly, and there is only one with that name
                    const nameMatchesExactly = (interaction) => searchResults.filter(r => l(r.obj.names, interaction).toLowerCase() === searchQuery.toLowerCase()).length === 1;

                    if(searchResults.length === 0) {
                        return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.BUNDLE_NOT_FOUND)],
                            ephemeral: true
                        });
                    } else if(searchResults.length === 1 || nameMatchesExactly(interaction) || nameMatchesExactly()) { // check both localized and english
                        const bundle = searchResults[0].obj;
                        const message = await renderBundle(bundle, interaction, emoji)

                        return await interaction.followUp(message);
                    } else {
                        const row = new MessageActionRow();

                        const options = searchResults.map(result => {
                            return {
                                label: l(result.obj.names, interaction),
                                value: `bundle-${result.obj.uuid}`
                            }
                        });

                        // some bundles have the same name (e.g. Magepunk)
                        const nameCount = {};
                        for(const option of options) {
                            if(option.label in nameCount) nameCount[option.label]++;
                            else nameCount[option.label] = 1;
                        }

                        for(let i = options.length - 1; i >= 0; i--) {
                            const occurrence = nameCount[options[i].label]--;
                            if(occurrence > 1) options[i].label += " " + occurrence;
                        }

                        row.addComponents(new MessageSelectMenu().setCustomId("bundle-select").setPlaceholder(s(interaction).info.BUNDLE_CHOICE_PLACEHOLDER).addOptions(options));

                        await interaction.followUp({
                            embeds: [secondaryEmbed(s(interaction).info.BUNDLE_CHOICE)],
                            components: [row]
                        });
                    }

                    break;
                }
                case "nightmarket": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await fetchNightMarket(interaction, valorantUser);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s night market!`);

                    break;
                }
                case "balance": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const channel = interaction.channel || await fetchChannel(interaction.channelId);
                    const VPEmojiPromise = VPEmoji(interaction, channel);
                    const RadEmojiPromise = RadEmoji(interaction, channel);

                    const balance = await getBalance(interaction.user.id);

                    if(!balance.success) return await interaction.followUp(authFailureMessage(interaction, balance, "**Could not fetch your balance**, most likely you got logged out. Try logging in again."));

                    const theVPEmoji = await VPEmojiPromise;
                    const theRadEmoji = await RadEmojiPromise || "";

                    await interaction.followUp({
                        embeds: [{ // move this to embed.js?
                            title: s(interaction).info.WALLET_HEADER.f({u: valorantUser.username}, interaction),
                            color: VAL_COLOR_1,
                            fields: [
                                {name: s(interaction).info.VPOINTS, value: `${theVPEmoji} ${balance.vp}`, inline: true},
                                {name: s(interaction).info.RADIANITE, value: `${theRadEmoji} ${balance.rad}`, inline: true}
                            ]
                        }]
                    });
                    console.log(`Sent ${interaction.user.tag}'s balance!`);

                    break;
                }
                case "alert": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    const channel = interaction.channel || await fetchChannel(interaction.channelId);
                    if(!canSendMessages(channel)) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.ALERT_NO_PERMS)]
                    });

                    await defer(interaction);

                    const auth = await authUser(interaction.user.id);
                    if(!auth.success) return await interaction.followUp(authFailureMessage(interaction, auth, s(interaction).error.AUTH_ERROR_ALERTS));

                    const searchQuery = interaction.options.get("skin").value
                    const searchResults = await searchSkin(searchQuery, interaction.locale, 25);

                    // filter out results for which the user already has an alert set up
                    const filteredResults = [];
                    for(const result of searchResults) {
                        const otherAlert = alertExists(interaction.user.id, result.obj.uuid);
                        if(!otherAlert) filteredResults.push(result);
                    }

                    if(filteredResults.length === 0) {
                        if(searchResults.length === 0) return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.SKIN_NOT_FOUND)]
                        });

                        const skin = searchResults[0].obj;
                        const otherAlert = alertExists(interaction.user.id, skin.levelUuid);
                        return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.DUPLICATE_ALERT.f({s: await skinNameAndEmoji(skin, interaction.channel, interaction.locale), c: otherAlert.channel_id}))],
                            components: [removeAlertActionRow(interaction.user.id, skin.uuid, s(interaction).info.REMOVE_ALERT_BUTTON)],
                            ephemeral: true
                        });
                    } else if(filteredResults.length === 1 ||
                        l(filteredResults[0].obj.names, interaction.locale).toLowerCase() === searchQuery.toLowerCase() ||
                        l(filteredResults[0].obj.names).toLowerCase() === searchQuery.toLowerCase()) {
                        const skin = filteredResults[0].obj;

                        addAlert(interaction.user.id, {
                            uuid: skin.uuid,
                            channel_id: interaction.channelId
                        });

                        return await interaction.followUp({
                            embeds: [await skinChosenEmbed(interaction, skin)],
                            components: [removeAlertActionRow(interaction.user.id, skin.uuid, s(interaction).info.REMOVE_ALERT_BUTTON)],
                        });
                    } else {
                        const row = new MessageActionRow();
                        const options = filteredResults.splice(0, 25).map(result => {
                            return {
                                label: l(result.obj.names, interaction),
                                value: `skin-${result.obj.uuid}`
                            }
                        });
                        row.addComponents(new MessageSelectMenu().setCustomId("skin-select").setPlaceholder(s(interaction).info.ALERT_CHOICE_PLACEHOLDER).addOptions(options));

                        await interaction.followUp({
                            embeds: [secondaryEmbed(s(interaction).info.ALERT_CHOICE)],
                            components: [row]
                        });
                    }

                    break;
                }
                case "alerts": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await fetchAlerts(interaction);
                    await interaction.followUp(message);

                    break;
                }
                case "testalerts": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const auth = await authUser(interaction.user.id);
                    if(!auth.success) return await interaction.followUp(authFailureMessage(interaction, auth, s(interaction).error.AUTH_ERROR_ALERTS));

                    const success = await testAlerts(interaction);

                    await alertTestResponse(interaction, success);

                    break;
                }
                case "login": {
                    await defer(interaction, true);

                    const json = readUserJson(interaction.user.id);
                    if(json && json.accounts.length >= config.maxAccountsPerUser) {
                        return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.TOO_MANY_ACCOUNTS.f({n: config.maxAccountsPerUser}))]
                        })
                    }

                    const username = interaction.options.get("username").value;
                    const password = interaction.options.get("password").value;

                    await loginUsernamePassword(interaction, username, password);

                    break;
                }
                case "2fa": {
                    if(!valorantUser || !valorantUser.auth || !valorantUser.auth.waiting2FA) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.UNEXPECTED_2FA)],
                        ephemeral: true
                    });

                    await defer(interaction, true);

                    const code = interaction.options.get("code").value.toString().padStart(6, '0');

                    await login2FA(interaction, code);

                    break;
                }
                case "cookies": {
                    await defer(interaction, true);

                    const cookies = interaction.options.get("cookies").value;

                    let success = await queueCookiesLogin(interaction.user.id, cookies);

                    while(success.inQueue) {
                        const queueStatus = getAuthQueueItemStatus(success.c);
                        if(queueStatus.processed) success = queueStatus.result;
                        else await wait(150);
                    }

                    const user = getUser(interaction.user.id);
                    let embed;
                    if(success && user) {
                        console.log(`${interaction.user.tag} logged in as ${user.username} using cookies`)
                        embed = basicEmbed(s(interaction).info.LOGGED_IN.f({u: user.username}));
                        setUserLocale(user, interaction.locale);
                    } else {
                        console.log(`${interaction.user.tag} cookies login failed`);
                        embed = basicEmbed(s(interaction).error.INVALID_COOKIES);
                    }

                    await interaction.followUp({
                        embeds: [embed],
                        ephemeral: true
                    });

                    break;
                }
                case "forget": {
                    const accountCount = getNumberOfAccounts(interaction.user.id);
                    if(accountCount === 0) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    const targetAccount = interaction.options.get("account") && interaction.options.get("account").value;
                    if(targetAccount) {
                        const targetIndex = findTargetAccountIndex(interaction.user.id, targetAccount);

                        if(targetIndex === null) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.ACCOUNT_NOT_FOUND)],
                            ephemeral: true
                        });

                        if(targetIndex > accountCount) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.ACCOUNT_NUMBER_TOO_HIGH.f({n: accountCount}))],
                            ephemeral: true
                        });

                        const usernameOfDeleted = deleteUser(interaction.user.id, targetIndex);

                        await interaction.reply({
                            embeds: [basicEmbed(s(interaction).info.SPECIFIC_ACCOUNT_DELETED.f({n: targetIndex, u: usernameOfDeleted}, interaction))],
                        });
                    } else {
                        deleteWholeUser(interaction.user.id);
                        console.log(`${interaction.user.tag} deleted their account`);

                        await interaction.reply({
                            embeds: [basicEmbed(s(interaction).info.ACCOUNT_DELETED)],
                            ephemeral: true
                        });
                    }
                    break;
                }
                case "collection": {
                    let targetUser = interaction.user;

                    const otherUser = interaction.options.getUser("user");
                    if(otherUser && otherUser.id !== interaction.user.id) {
                        const otherValorantUser = getUser(otherUser.id);
                        if(!otherValorantUser) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED_OTHER)]
                        });

                        if(!getSetting(otherUser.id, "othersCanViewColl")) return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.OTHER_COLLECTION_DISABLED.f({u: `<@${otherUser.id}>`}))]
                        });

                        targetUser = otherUser;
                    }
                    else if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await renderCollection(interaction, targetUser.id);
                    await interaction.followUp(message);

                    console.log(`Sent ${targetUser.tag}'s collection!`);

                    break;
                }
                case "battlepass": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const message = await renderBattlepassProgress(interaction);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s battlepass!`);

                    break;
                }
                case "stats": {
                    await defer(interaction);

                    const skinName = (interaction.options.get("skin") || {}).value;

                    if(skinName) {
                        const skins = await searchSkin(skinName, interaction.locale, 25);

                        if(skins.length === 0) {
                            return await interaction.followUp({
                                embeds: [basicEmbed(s(interaction).error.SKIN_NOT_FOUND)]
                            });
                        } else if(skins.length === 1 ||
                            l(skins[0].obj.names, interaction.locale).toLowerCase() === skinName.toLowerCase() ||
                            l(skins[0].obj.names).toLowerCase() === skinName.toLowerCase()) {
                            const skin = skins[0].obj;

                            const stats = getStatsFor(skin.uuid);

                            return await interaction.followUp({
                                embeds: [await statsForSkinEmbed(skin, stats, interaction)]
                            });
                        } else {
                            const row = new MessageActionRow();
                            const options = skins.map(result => {
                                return {
                                    label: l(result.obj.names, interaction),
                                    value: `skin-${result.obj.uuid}`
                                }
                            });
                            row.addComponents(new MessageSelectMenu().setCustomId("skin-select-stats").setPlaceholder(s(interaction).info.ALERT_CHOICE_PLACEHOLDER).addOptions(options));

                            await interaction.followUp({
                                embeds: [secondaryEmbed(s(interaction).info.STATS_CHOICE)],
                                components: [row]
                            });
                        }

                    } else {
                        await interaction.followUp(await allStatsEmbed(interaction, getOverallStats()));
                    }

                    break;
                }
                case "account": {
                    const accountCount = getNumberOfAccounts(interaction.user.id);
                    if(accountCount === 0) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    const targetAccount = interaction.options.get("account").value;
                    const targetIndex = findTargetAccountIndex(interaction.user.id, targetAccount);

                    if(targetIndex === null) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.ACCOUNT_NOT_FOUND)],
                        ephemeral: true
                    });

                    if(targetIndex > accountCount) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.ACCOUNT_NUMBER_TOO_HIGH.f({n: accountCount}))],
                        ephemeral: true
                    });

                    const valorantUser = switchAccount(interaction.user.id, targetIndex);

                    await interaction.reply({
                        embeds: [basicEmbed(s(interaction).info.ACCOUNT_SWITCHED.f({n: targetIndex, u: valorantUser.username}, interaction))],
                    });
                    break;
                }
                case "accounts": {
                    const userJson = readUserJson(interaction.user.id);
                    if(!userJson) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await interaction.reply(accountsListEmbed(interaction, userJson));

                    break;
                }
                case "settings": {
                    switch(interaction.options.getSubcommand()) {
                        case "view": return await handleSettingsViewCommand(interaction);
                        case "set": return await handleSettingsSetCommand(interaction);
                    }

                    break;
                }
                case "valstatus": {
                    await defer(interaction);

                    const json = await fetchMaintenances(valorantUser.region);
                    await interaction.followUp(valMaintenancesEmbeds(interaction, json));

                    break;
                }
                case "info": {
                    let guildCount, userCount;
                    if(client.shard) {
                        const guildCounts = await client.shard.fetchClientValues('guilds.cache.size');
                        guildCount = guildCounts.reduce((acc, guildCount) => acc + guildCount, 0);

                        const userCounts = await client.shard.broadcastEval(c => c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0));
                        userCount = userCounts.reduce((acc, guildCount) => acc + guildCount, 0);
                    } else {
                        guildCount = client.guilds.cache.size;

                        userCount = 0;
                        for(const guild of client.guilds.cache.values())
                            userCount += guild.memberCount;
                    }

                    const registeredUserCount = getUserList().length;

                    await interaction.reply(botInfoEmbed(interaction, client, guildCount, userCount, registeredUserCount, config.ownerName, config.status));

                    break;
                }
                default: {
                    await interaction.reply(s(interaction).info.UNHANDLED_COMMAND);
                    break;
                }
            }
        } catch(e) {
            await handleError(e, interaction);
        }
    } else if(interaction.isSelectMenu()) {
        try {
            console.log(`${interaction.user.tag} selected an option from the dropdown`);
            switch (interaction.customId) {
                case "skin-select": {
                    if(interaction.message.interaction.user.id !== interaction.user.id) {
                        return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_ALERT)],
                            ephemeral: true
                        });
                    }

                    const chosenSkin = interaction.values[0].substr(5);
                    const skin = await getSkin(chosenSkin);

                    const otherAlert = alertExists(interaction.user.id, chosenSkin);
                    if(otherAlert) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.DUPLICATE_ALERT.f({s: await skinNameAndEmoji(skin, interaction.channel, interaction.locale), c: otherAlert.channel_id}))],
                        components: [removeAlertActionRow(interaction.user.id, otherAlert.uuid, s(interaction).info.REMOVE_ALERT_BUTTON)],
                        ephemeral: true
                    });

                    addAlert(interaction.user.id, {
                        id: interaction.user.id,
                        uuid: chosenSkin,
                        channel_id: interaction.channelId
                    });

                    await interaction.update({
                        embeds: [await skinChosenEmbed(interaction, skin)],
                        components: [removeAlertActionRow(interaction.user.id, chosenSkin, s(interaction).info.REMOVE_ALERT_BUTTON)]
                    });

                    break;
                }
                case "skin-select-stats": {
                    if(interaction.message.interaction.user.id !== interaction.user.id) {
                        return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_STATS)],
                            ephemeral: true
                        });
                    }

                    const chosenSkin = interaction.values[0].substr(5);
                    const skin = await getSkin(chosenSkin);
                    const stats = getStatsFor(chosenSkin);

                    await interaction.update({
                        embeds: [await statsForSkinEmbed(skin, stats, interaction)],
                        components: []
                    });

                    break;
                }
                case "bundle-select": {
                    if(interaction.message.interaction.user.id !== interaction.user.id) {
                        return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_BUNDLE)],
                            ephemeral: true
                        });
                    }

                    const chosenBundle = interaction.values[0].substring(7);
                    const bundle = await getBundle(chosenBundle);

                    const channel = interaction.channel || await fetchChannel(interaction.channelId);
                    const emoji = await VPEmoji(interaction, channel);
                    const message = await renderBundle(bundle, interaction, emoji);

                    await interaction.update({
                        embeds: message.embeds,
                        components: []
                    });

                    break;
                }
                case "set-setting": {
                    await handleSettingDropdown(interaction);
                    break;
                }
            }
        } catch(e) {
            await handleError(e, interaction);
        }
    } else if(interaction.isButton()) {
        try {
            console.log(`${interaction.user.tag} clicked ${interaction.component.customId}`);
            if(interaction.customId.startsWith("removealert/")) {
                const [, uuid, id] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_ALERT)],
                    ephemeral: true
                });

                const success = removeAlert(id, uuid);
                if(success) {
                    const skin = await getSkin(uuid);

                    const channel = interaction.channel || await fetchChannel(interaction.channelId);
                    await interaction.reply({
                        embeds: [basicEmbed(s(interaction).info.ALERT_REMOVED.f({s: await skinNameAndEmoji(skin, channel, interaction.locale)}))],
                        ephemeral: true
                    });

                    if(interaction.message.flags.has(MessageFlags.FLAGS.EPHEMERAL)) return; // message is ephemeral

                    if(interaction.message.interaction && interaction.message.interaction.commandName === "alert") { // if the message is the response to /alert
                        await interaction.message.delete().catch(() => {});
                    } else if(!interaction.message.interaction) { // the message is an automatic alert
                        const actionRow = removeAlertActionRow(interaction.user.id, uuid, s(interaction).info.REMOVE_ALERT_BUTTON);
                        actionRow.components[0].setDisabled(true).setLabel("Removed");

                        await interaction.update({components: [actionRow]}).catch(() => {});
                    }
                } else {
                    await interaction.reply({embeds: [basicEmbed(s(interaction).error.GHOST_ALERT)], ephemeral: true});
                }
            } else if(interaction.customId.startsWith("retry_auth")) {
                await interaction.deferReply({ephemeral: true});
                const [, operationIndex] = interaction.customId.split('/');
                await retryFailedOperation(interaction, parseInt(operationIndex));
            } else if(interaction.customId.startsWith("changealertspage")) {
                const [, id, pageIndex] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_ALERT)],
                    ephemeral: true
                });

                const emojiString = await VPEmoji(interaction);
                await interaction.update(await alertsPageEmbed(interaction, await filteredAlertsForUser(interaction), parseInt(pageIndex), emojiString));
            } else if(interaction.customId.startsWith("changestatspage")) {
                const [, id, pageIndex] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_STATS)],
                    ephemeral: true
                });

                await interaction.update(await allStatsEmbed(interaction, await getOverallStats(), parseInt(pageIndex)));
            } else if(interaction.customId.startsWith("clpage")) {
                const [, id, pageIndex] = interaction.customId.split('/');

                let user;
                if(id !== interaction.user.id) user = getUser(id);
                else user = valorantUser;

                const loadoutResponse = await getLoadout(user);
                if(!loadoutResponse.success) return await interaction.reply(authFailureMessage(interaction, loadoutResponse, s(interaction).error.AUTH_ERROR_COLLECTION, id !== interaction.user.id));

                await interaction.update(await skinCollectionPageEmbed(interaction, id, user, loadoutResponse.loadout, parseInt(pageIndex)));
            } else if(interaction.customId.startsWith("clswitch")) {
                const [, switchTo, id] = interaction.customId.split('/');
                const switchToPage = switchTo === "p";

                let user;
                if(id !== interaction.user.id) user = getUser(id);
                else user = valorantUser;

                const loadoutResponse = await getLoadout(user);
                if(!loadoutResponse.success) return await interaction.reply(authFailureMessage(interaction, loadoutResponse, s(interaction).error.AUTH_ERROR_COLLECTION, id !== interaction.user.id));

                const loadout = loadoutResponse.loadout;
                if(switchToPage) await interaction.update(await skinCollectionPageEmbed(interaction, id, user, loadout));
                else await interaction.update(await skinCollectionSingleEmbed(interaction, id, user, loadout));
            } else if(interaction.customId.startsWith("viewbundle")) {
                const [, id, uuid] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_BUNDLE)],
                    ephemeral: true
                });

                const bundle = await getBundle(uuid);
                const emoji = await VPEmoji(interaction);
                await interaction.update({
                    components: [],
                    ...await renderBundle(bundle, interaction, emoji),
                });
            } else if(interaction.customId.startsWith("account")) {

                const [, customId, id, accountIndex] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_GENERIC)],
                    ephemeral: true
                });

                if(!canSendMessages(interaction.channel)) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.GENERIC_NO_PERMS)]
                });

                const channel = await client.channels.fetch(interaction.channelId);
                const message = await channel.messages.fetch(interaction.message.id);
                if(!message.components) message.components = switchAccountButtons(interaction, customId, true);

                for(const actionRow of message.components) {
                    for(const component of actionRow.components) {
                        if(component.customId === interaction.customId) {
                            component.label = s(interaction).info.LOADING;
                            component.style = "DANGER";
                            component.emoji = {name: '⏳'};
                        }
                    }
                }

                await interaction.update({
                    embeds: message.embeds,
                    components: message.components
                });

                const success = switchAccount(interaction.user.id, parseInt(accountIndex));
                if(!success) return await interaction.followUp({
                        embeds: [basicEmbed(s(interaction).error.ACCOUNT_NOT_FOUND)],
                        ephemeral: true
                });

                let newMessage;
                switch(customId) {
                    case "shop": newMessage = await fetchShop(interaction, getUser(interaction.user.id)); break;
                    case "nm": newMessage = await fetchNightMarket(interaction, getUser(interaction.user.id)); break;
                    case "bp": newMessage = await renderBattlepassProgress(interaction); break;
                    case "alerts": newMessage = await fetchAlerts(interaction); break;
                    case "cl": newMessage = await renderCollection(interaction); break;
                }

                if(!newMessage.components) newMessage.components = switchAccountButtons(interaction, customId, true);


                await message.edit(newMessage);
            }
        } catch(e) {
            await handleError(e, interaction);
        }
    } else if(interaction.isAutocomplete()) {
        try {
            // console.log("Received autocomplete interaction from " + interaction.user.tag);
            if(interaction.commandName === "alert" || interaction.commandName === "stats") {
                const focusedValue = interaction.options.getFocused();
                const searchResults = await searchSkin(focusedValue, interaction.locale, 5);

                await interaction.respond(searchResults.map(result => ({
                    name: result.obj.names[discToValLang[interaction.locale] || DEFAULT_VALORANT_LANG],
                    value: result.obj.names[DEFAULT_VALORANT_LANG],
                    nameLocalizations: valNamesToDiscordNames(result.obj.names) // does this even work?
                })));
            } else if(interaction.commandName === "bundle") {

                const focusedValue = interaction.options.getFocused();
                const searchResults = await searchBundle(focusedValue, interaction.locale, 5);

                await interaction.respond(searchResults.map(result => ({
                    name: result.obj.names[discToValLang[interaction.locale] || DEFAULT_VALORANT_LANG],
                    value: result.obj.names[DEFAULT_VALORANT_LANG],
                    nameLocalizations: valNamesToDiscordNames(result.obj.names) // does this even work?
                })));
            } else if(interaction.commandName === "account" || interaction.commandName === "forget") {
                const focusedValue = interaction.options.getFocused();

                const userJson = readUserJson(interaction.user.id);
                if(!userJson) return await interaction.respond([]);

                const values = [];
                for(const [index, account] of Object.entries(userJson.accounts)) {
                    const username = account.username || s(interaction).info.NO_USERNAME;
                    if(values.find(a => a.name === username)) continue;

                    values.push({
                        name: username,
                        value: (parseInt(index) + 1).toString()
                    });
                }

                const filteredValues = fuzzysort.go(focusedValue, values, {
                    key: "name",
                    threshold: -1000,
                    limit: 5,
                    all: true
                });

                await interaction.respond(filteredValues.map(value => value.obj));
            }
        } catch(e) {
            console.error(e);
            // await handleError(e, interaction); // unknown interaction happens quite often
        }
    }
});

const handleError = async (e, interaction) => {
    const message = s(interaction).error.GENERIC_ERROR.f({e: e.message});
    try {
        const embed = basicEmbed(message);
        if(interaction.deferred) await interaction.followUp({embeds: [embed], ephemeral: true});
        else await interaction.reply({embeds: [embed], ephemeral: true});
        console.error(e);
    } catch(e2) {
        console.error("There was a problem while trying to handle an error!\nHere's the original error:");
        console.error(e);
        console.error("\nAnd here's the error while trying to handle it:");
        console.error(e2);
    }
}

export const startBot = () => {
    console.log("Logging in...");
    client.login(config.token);
}
