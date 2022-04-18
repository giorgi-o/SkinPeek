import {Client, Intents, MessageActionRow, MessageFlags, MessageSelectMenu} from "discord.js";
import {getSkin, fetchData, searchSkin, searchBundle, getBundle} from "../valorant/cache.js";
import {
    addAlert,
    alertExists, alertsForGuild,
    checkAlerts, filteredAlertsForUser, removeAlert,
    removeAlertsInChannel,
    setClient, testAlerts
} from "./alerts.js";
import cron from "node-cron";
import {
    authUser,
    cleanupAccounts, deleteUser,
    getUser, getUserList,
} from "../valorant/auth.js";
import {
    canSendMessages,
    defer,
    emojiToString,
    externalEmojisAllowed,
    removeAlertActionRow,
    skinNameAndEmoji, wait
} from "../misc/util.js";
import {RadEmoji, VPEmoji} from "./emoji.js";
import {getBalance, getBundles, getNightMarket, getOffers} from "../valorant/shop.js";
import { getBattlepassProgress } from "../valorant/battlepass.js";
import config, {saveConfig} from "../misc/config.js";
import {
    authFailureMessage,
    basicEmbed,
    renderBundle,
    renderBundles,
    renderNightMarket,
    renderBattlepass,
    renderOffers,
    secondaryEmbed,
    skinChosenEmbed,
    VAL_COLOR_1, botInfoEmbed, ownerMessageEmbed, alertTestResponse, alertsPageEmbed
} from "./embed.js";
import {
    getQueueItemStatus,
    processQueue,
    queueCookiesLogin,
} from "../valorant/authQueue.js";
import {l, s} from "../misc/languages.js";
import {login2FA, loginUsernamePassword, retryFailedOperation} from "./authManager.js";

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES], // what intents does the bot need
    shards: "auto"
});
const cronTasks = [];

client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    console.log("Loading skins...");
    fetchData().then(() => console.log("Skins loaded!"));

    setClient(client);

    scheduleTasks();

    await client.user.setActivity("your store!", {type: "WATCHING"});
});

const scheduleTasks = () => {
    console.debug("Scheduling tasks...");

    // check alerts every day at 00:00:10 GMT
    if(config.refreshSkins) cronTasks.push(cron.schedule(config.refreshSkins, checkAlerts, {timezone: "GMT"}));

    // check for new valorant version every 15mins
    if(config.checkGameVersion) cronTasks.push(cron.schedule(config.checkGameVersion, () => fetchData(null, true)));

    // cleanup accounts every hour
    if(config.cleanupAccounts) cronTasks.push(cron.schedule(config.cleanupAccounts, cleanupAccounts));

    // if login queue is enabled, process an item every 3 seconds
    if(config.useLoginQueue && config.loginQueue) cronTasks.push(cron.schedule(config.loginQueue, processQueue));
}

const destroyTasks = () => {
    console.debug("Destroying scheduled tasks...");
    for(const task of cronTasks)
        task.stop();
    cronTasks.length = 0;
}

const commands = [
    {
        name: "skins",
        description: "Deprecated, use /shop instead."
    },
    {
        name: "shop",
        description: "Show your current daily shop!"
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
            required: true
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
            required: true
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
        name: "forget",
        description: "Forget and permanently delete your account from the bot."
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
        console.debug(`${message.author.tag} sent admin command ${content}`);

        if(content === "!deploy guild") {
            if(!message.guild) return;

            console.log("deploying commands...");

            await message.guild.commands.set(commands).then(() => console.log(`Commands deployed in guild ${message.guild.name}!`));

            await message.reply("Deployed in guild!");
        } else if(content === "!deploy global") {
            console.log("Deploying commands in guild...");

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

                let s = "Successfully reloaded the config!";
                if(config.token !== oldToken)
                    s += "\nI noticed you changed the token. You'll have to restart the bot for that to happen."
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
        } else if(content.startsWith("!message")) {
            const messageContent = content.substring(9);
            const messageEmbed = ownerMessageEmbed(messageContent, message.author);

            await message.reply(`Sending message to ${client.guilds.cache.size} guilds...`);

            for(const guild of client.guilds.cache.values()) {
                try {
                    const alerts = await alertsForGuild(guild.id);
                    if(!alerts.length) continue;

                    const alertsPerChannel = {};
                    for(const alert of alerts) {
                        if(alertsPerChannel[alert.channel_id]) alertsPerChannel[alert.channel_id]++;
                        else alertsPerChannel[alert.channel_id] = 1;
                    }

                    let channelWithMostAlerts = [null, 0];
                    for(const channelId in alertsPerChannel) {
                        if(alertsPerChannel[channelId] > channelWithMostAlerts[1]) {
                            channelWithMostAlerts = [channelId, alertsPerChannel[channelId]];
                        }
                    }
                    if(channelWithMostAlerts[0] === null) continue;

                    const channel = await guild.channels.fetch(channelWithMostAlerts[0]);
                    if(channel) await channel.send({
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
            await checkAlerts();
            await message.reply("Checked alerts!");
        }
    } catch(e) {
        console.error("Error while processing message!");
        console.error(e);
    }
});

client.on("interactionCreate", async (interaction) => {
    const valorantUser = getUser(interaction.user.id);
    if(valorantUser) valorantUser.locale = interaction.locale;

    if(interaction.isCommand()) {
        try {
            console.log(`${interaction.user.tag} used /${interaction.commandName}`);
            switch (interaction.commandName) {
                case "skins":
                case "shop": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    // fetch the channel if not in cache
                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);

                    // start uploading emoji now
                    const emojiPromise = VPEmoji(channel, externalEmojisAllowed(channel));

                    const shop = await getOffers(interaction.user.id);

                    const message = await renderOffers(shop, interaction, valorantUser, await emojiPromise);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s shop!`); // also logged if maintenance/login failed

                    break;
                }
                case "bundles": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const emojiPromise = VPEmoji(channel, externalEmojisAllowed(channel));

                    const bundles = await getBundles(interaction.user.id);

                    const message = await renderBundles(bundles, interaction, await emojiPromise);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s bundle(s)!`);

                    break;
                }
                case "bundle": {
                    await defer(interaction);

                    const searchQuery = interaction.options.get("bundle").value.replace(/collection/i, "").replace(/bundle/i, "");
                    const searchResults = await searchBundle(searchQuery, interaction.locale);

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const emoji = await VPEmoji(channel, externalEmojisAllowed(channel));

                    if(searchResults.length === 0) {
                        return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.BUNDLE_NOT_FOUND)],
                            ephemeral: true
                        });
                    } else if(searchResults.length === 1) {
                        const bundle = searchResults[0];
                        const message = await renderBundle(bundle, interaction, emoji)

                        return await interaction.followUp(message);
                    } else {
                        const row = new MessageActionRow();
                        const options = searchResults.splice(0, 25).map(result => {
                            return {
                                label: l(result.names, interaction),
                                value: `bundle-${result.uuid}`
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

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const emojiPromise = VPEmoji(channel, externalEmojisAllowed(channel));

                    const market = await getNightMarket(interaction.user.id);

                    const message = await renderNightMarket(market, interaction, valorantUser, await emojiPromise);
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

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const VPEmojiPromise = VPEmoji(channel, externalEmojisAllowed(channel));
                    const RadEmojiPromise = RadEmoji(channel, externalEmojisAllowed(channel));

                    const balance = await getBalance(interaction.user.id);

                    if(!balance.success) return await interaction.followUp(authFailureMessage(interaction, balance, "**Could not fetch your balance**, most likely you got logged out. Try logging in again."));

                    const theVPEmoji = emojiToString(await VPEmojiPromise) || "";
                    const theRadEmoji = emojiToString(await RadEmojiPromise) || "";

                    await interaction.followUp({
                        embeds: [{ // move this to embed.js?
                            title: s(interaction).info.WALLET_HEADER.f({u: valorantUser.username}),
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

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    if(!canSendMessages(channel)) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.ALERT_NO_PERMS)]
                    });

                    await defer(interaction);

                    const searchQuery = interaction.options.get("skin").value
                    const searchResults = await searchSkin(searchQuery, interaction.locale);

                    // filter out results for which the user already has an alert set up
                    const filteredResults = [];
                    for(const result of searchResults) {
                        const otherAlert = alertExists(interaction.user.id, result.uuid);
                        if(otherAlert) { // user already has an alert for this skin
                            // maybe it's in a now deleted channel?
                            const otherChannel = await client.channels.fetch(otherAlert.channel_id).catch(() => {});
                            if(!otherChannel) {
                                removeAlertsInChannel(otherAlert.channel_id);
                                filteredResults.push(result);
                            }
                        } else filteredResults.push(result);
                    }

                    if(filteredResults.length === 0) {
                        if(searchResults.length === 0) return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.SKIN_NOT_FOUND)],
                            ephemeral: true
                        });

                        const skin = searchResults[0];
                        const otherAlert = alertExists(interaction.user.id, skin.uuid);
                        return await interaction.followUp({
                            embeds: [basicEmbed(s(interaction).error.DUPLICATE_ALERT.f({s: await skinNameAndEmoji(skin, interaction.channel, interaction.locale), c: otherAlert.channel_id}))],
                            components: [removeAlertActionRow(interaction.user.id, skin.uuid, s(interaction).info.REMOVE_ALERT_BUTTON)],
                            ephemeral: true
                        });
                    } else if(filteredResults.length === 1 ||
                        l(filteredResults[0].names, interaction.locale).toLowerCase() === searchQuery.toLowerCase() ||
                        l(filteredResults[0].names).toLowerCase() === searchQuery.toLowerCase()) {
                        const skin = filteredResults[0];

                        addAlert({
                            id: interaction.user.id,
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
                                label: l(result.names, interaction),
                                value: `skin-${result.uuid}`
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

                    const auth = await authUser(interaction.user.id);
                    if(!auth.success) return await interaction.followUp(authFailureMessage(interaction, auth, s(interaction).error.AUTH_ERROR_ALERTS));

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const emojiString = emojiToString(await VPEmoji(channel, externalEmojisAllowed(channel)) || s(interaction).info.PRICE);

                    await interaction.followUp(await alertsPageEmbed(interaction, await filteredAlertsForUser(interaction), 0, emojiString));

                    break;
                }
                case "testalerts": {
                    await defer(interaction);

                    const success = await testAlerts(interaction);

                    await alertTestResponse(interaction, success);

                    break;
                }
                case "login": {
                    await defer(interaction, true);

                    const username = interaction.options.get("username").value;
                    const password = interaction.options.get("password").value;

                    await loginUsernamePassword(interaction, username, password);

                    break;
                }
                case "2fa": {
                    if(!valorantUser || !valorantUser.waiting2FA) return await interaction.reply({
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
                        const queueStatus = getQueueItemStatus(success.c);
                        if(queueStatus.processed) success = queueStatus.result;
                        else await wait(150);
                    }

                    const user = getUser(interaction.user.id);
                    let embed;
                    if(success && user) {
                        console.log(`${interaction.user.tag} logged in as ${user.username} using cookies`)
                        embed = basicEmbed(s(interaction).info.LOGGED_IN.f({u: user.username}));
                        user.locale = interaction.locale;
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
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.FORGET_FORGOTTEN)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    deleteUser(interaction.user.id, true);
                    console.log(`${interaction.user.tag} deleted their account`);

                    await interaction.followUp({
                        embeds: [basicEmbed(s(interaction).info.ACCOUNT_DELETED)],
                        ephemeral: true
                    });
                    break;
                }
                case "battlepass": {
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const battlepassProgress = await getBattlepassProgress(interaction.user.id, interaction.options.get("maxlevel") !== null ? interaction.options.get("maxlevel").value : 50);

                    if(battlepassProgress.success === false)
                        return await interaction.followUp(authFailureMessage(interaction, battlepassProgress, s(interaction).error.AUTH_ERROR_BPASS));

                    const message = await renderBattlepass(battlepassProgress, interaction.options.get("maxlevel") !== null ? interaction.options.get("maxlevel").value : 50, interaction, valorantUser);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s battlepass!`);

                    break;
                }
                case "info": {
                    const guildCount = client.guilds.cache.size;

                    let userCount = 0;
                    for(const guild of client.guilds.cache.values())
                        userCount += guild.memberCount;

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

                    addAlert({
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
                case "bundle-select": {
                    if(interaction.message.interaction.user.id !== interaction.user.id) {
                        return await interaction.reply({
                            embeds: [basicEmbed(s(interaction).error.NOT_UR_MESSAGE_BUNDLE)],
                            ephemeral: true
                        });
                    }

                    const chosenBundle = interaction.values[0].substring(7);
                    const bundle = await getBundle(chosenBundle);

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
                    const emoji = await VPEmoji(channel, externalEmojisAllowed(channel));
                    const message = await renderBundle(bundle, interaction, emoji);

                    await interaction.update({
                        embeds: message.embeds,
                        components: []
                    });

                    break;
                }
            }
        } catch(e) {
            await handleError(e, interaction);
        }
    } else if(interaction.isButton()) {
        try {
            console.log(`${interaction.user.tag} clicked ${interaction.component.label}`);
            if(interaction.customId.startsWith("removealert/")) {
                const [, uuid, id] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_ALERT)],
                    ephemeral: true
                });

                const success = removeAlert(id, uuid);
                if(success) {
                    const skin = await getSkin(uuid);

                    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
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
            } else if(interaction.customId.startsWith("changepage")) {
                const [, id, pageIndex] = interaction.customId.split('/');

                if(id !== interaction.user.id) return await interaction.reply({
                    embeds: [basicEmbed(s(interaction).error.NOT_UR_ALERT)],
                    ephemeral: true
                });

                const emojiString = emojiToString(await VPEmoji(interaction.channel, externalEmojisAllowed(interaction.channel)) || s(interaction).info.PRICE);
                await interaction.update(await alertsPageEmbed(interaction, await filteredAlertsForUser(interaction), parseInt(pageIndex), emojiString));
            }
        } catch(e) {
            await handleError(e, interaction);
        }
    }
});

client.on("channelDelete", channel => {
    removeAlertsInChannel(channel.id);
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
