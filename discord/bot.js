import {Client, Intents, MessageActionRow, MessageFlags, MessageSelectMenu} from "discord.js";
import {getSkin, fetchData, searchSkin, searchBundle, getBundle} from "../valorant/cache.js";
import {
    addAlert,
    alertExists,
    alertsForUser,
    checkAlerts, removeAlert,
    removeAlertsFromUser,
    removeAlertsInChannel,
    setClient
} from "./alerts.js";
import cron from "node-cron";
import {
    authUser,
    cleanupAccounts, deleteUser,
    getUser,
    redeem2FACode,
    redeemCookies,
    redeemUsernamePassword
} from "../valorant/auth.js";
import {
    defer,
    emojiToString,
    externalEmojisAllowed,
    removeAlertActionRow, removeAlertButton,
    skinNameAndEmoji
} from "../misc/util.js";
import {RadEmoji, VPEmoji} from "./emoji.js";
import {getBalance, getBundles, getNightMarket, getOffers, getBattlepassProgress} from "../valorant/shop.js";
import config from "../misc/config.js";
import {
    authFailureMessage,
    basicEmbed,
    renderBundle,
    renderBundles,
    renderNightMarket,
    renderOffers,
    secondaryEmbed,
    skinChosenEmbed,
    VAL_COLOR_1
} from "./embed.js";

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}); // what intents does the bot need

client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    console.log("Loading skins...");
    fetchData().then(() => console.log("Skins loaded!"));

    setClient(client);

    // check alerts every day at 00:00:10 GMT
    cron.schedule(config.refreshSkins, checkAlerts, {timezone: "GMT"});

    // check for new valorant version every 15mins
    cron.schedule(config.checkGameVersion, () => fetchData(null, true));

    // cleanup accounts every hour
    cron.schedule(config.cleanupAccounts, cleanupAccounts);
});

const commands = [
    {
        name: "skins",
        description: "Deprecated, use /shop instead"
    },
    {
        name: "shop",
        description: "Show your current daily shop"
    },
    {
        name: "bundles",
        description: "Show your current featured bundles"
    },
    {
        name: "bundle",
        description: "Inspect a specific bundle",
        options: [{
            type: "STRING",
            name: "bundle",
            description: "The name of the bundle you want to inspect",
            required: true
        }]
    },
    {
        name: "nightmarket",
        description: "Show your night market if there is one"
    },
    {
        name: "balance",
        description: "Show how many valorant points you have in your account"
    },
    {
        name: "alert",
        description: "Set an alert for when a particular skin is in your shop",
        options: [{
            type: "STRING",
            name: "skin",
            description: "The name of the skin you want to set an alert for",
            required: true
        }]
    },
    {
        name: "alerts",
        description: "Show all your active alerts"
    },
    {
        name: "login",
        description: "Log in with your Riot username/password",
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
        description: "Forget and permanently delete your account from the bot"
    },
    {
        name: "battlepass",
        description: "Show current battlepass progression"
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
    } else if(message.content === "!undeploy") {
        console.log("Undeploying commands...");

        await client.application.commands.set([]).then(() => console.log("Commands undeployed globally!"));

        const guild = client.guilds.cache.get(message.guild.id);
        await guild.commands.set([]).then(() => console.log(`Commands undeployed in guild ${message.guild.name}!`));

        await message.reply("Undeployed in guild and globally!");
    }
});

client.on("interactionCreate", async (interaction) => {
    if(interaction.isCommand()) {
        try {
            console.log(`${interaction.user.tag} used /${interaction.commandName}`);
            switch (interaction.commandName) {
                case "skins":
                case "shop": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    // start uploading emoji now
                    const emojiPromise = VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));

                    await defer(interaction);

                    const shop = await getOffers(interaction.user.id);

                    const message = await renderOffers(shop, interaction, valorantUser, await emojiPromise);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s shop!`); // also logged if maintenance/login failed

                    break;
                }
                case "bundles": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    const emojiPromise = VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));

                    await defer(interaction);

                    const bundles = await getBundles(interaction.user.id);

                    const message = await renderBundles(bundles, interaction, await emojiPromise);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s bundles!`);

                    break;
                }
                case "bundle": {
                    const searchQuery = interaction.options.get("bundle").value.replace(/collection/g, "").replace(/bundle/i, "");
                    const searchResults = await searchBundle(searchQuery);

                    const emoji = await VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));

                    if(searchResults.length === 0) {
                        return await interaction.reply({
                            embeds: [basicEmbed("**Couldn't find a bundle with that name!** Check the spelling and try again.")],
                            ephemeral: true
                        });
                    } else if(searchResults.length === 1) {
                        const bundle = searchResults[0];
                        const message = await renderBundle(bundle, interaction, emoji)

                        return await interaction.reply(message);
                    } else {
                        // some bundles have the same name (e.g. Magepunk)

                        const row = new MessageActionRow();
                        const options = searchResults.splice(0, 25).map(result => {
                            return {
                                label: result.name,
                                value: `bundle-${result.uuid}`
                            }
                        });

                        const nameCount = {};
                        for(const option of options) {
                            if(option.label in nameCount) nameCount[option.label]++;
                            else nameCount[option.label] = 1;
                        }

                        for(let i = options.length - 1; i >= 0; i--) {
                            const occurence = nameCount[options[i].label]--;
                            if(occurence > 1) options[i].label += " " + occurence;
                            // nameCount[options[i].label]--;
                        }

                        row.addComponents(new MessageSelectMenu().setCustomId("bundle-select").setPlaceholder("Select bundle:").addOptions(options));

                        await interaction.reply({
                            embeds: [secondaryEmbed("Which bundle would you like to inspect?")],
                            components: [row]
                        });
                    }

                    break;
                }
                case "nightmarket": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    const emojiPromise = VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));

                    await defer(interaction);

                    const market = await getNightMarket(interaction.user.id);

                    const message = await renderNightMarket(market, interaction, valorantUser, await emojiPromise);
                    await interaction.followUp(message);

                    console.log(`Sent ${interaction.user.tag}'s night market!`);


                    break;
                }
                case "balance": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const VPEmojiPromise = VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));
                    const RadEmojiPromise = RadEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));

                    const balance = await getBalance(interaction.user.id);

                    if(!balance.success) return await interaction.followUp(authFailureMessage(interaction, balance, "**Could not fetch your balance**, most likely you got logged out. Try logging in again."));

                    const theVPEmoji = emojiToString(await VPEmojiPromise) || "Valorant Points:";
                    const theRadEmoji = emojiToString(await RadEmojiPromise) || "Radianite:";

                    await interaction.followUp({
                        embeds: [{ // move this to embed.js?
                            title: `**${valorantUser.username}**'s wallet:`,
                            color: VAL_COLOR_1,
                            fields: [
                                {name: "Valorant Points", value: `${theVPEmoji} ${balance.vp}`, inline: true},
                                {name: "Radianite", value: `${theRadEmoji} ${balance.rad}`, inline: true}
                            ]
                        }]
                    });
                    console.log(`Sent ${interaction.user.tag}'s balance!`);

                    break;
                }
                case "alert": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    const searchQuery = interaction.options.get("skin").value
                    const searchResults = await searchSkin(searchQuery);

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
                        if(searchResults.length === 0) return await interaction.reply({
                            embeds: [basicEmbed("**Couldn't find a skin with that name!** Check the spelling and try again.")],
                            ephemeral: true
                        });

                        const skin = searchResults[0];
                        const otherAlert = alertExists(interaction.user.id, skin.uuid);
                        return await interaction.reply({
                            embeds: [basicEmbed(`You already have an alert for the **${skin.name}** in <#${otherAlert.channel_id}>!`)],
                            components: [removeAlertActionRow(interaction.user.id, skin.uuid)],
                            ephemeral: true
                        });
                    } else if(filteredResults.length === 1 || filteredResults[0].name.toLowerCase() === searchQuery.toLowerCase()) {
                        const skin = filteredResults[0];

                        addAlert({
                            id: interaction.user.id,
                            uuid: skin.uuid,
                            channel_id: interaction.channel.id
                        });

                        return await interaction.reply({
                            embeds: [await skinChosenEmbed(skin, interaction.channel)],
                            components: [removeAlertActionRow(interaction.user.id, skin.uuid)]
                        });
                    } else {
                        const row = new MessageActionRow();
                        const options = filteredResults.splice(0, 25).map(result => {
                            return {
                                label: result.name,
                                value: `skin-${result.uuid}`
                            }
                        });
                        row.addComponents(new MessageSelectMenu().setCustomId("skin-select").setPlaceholder("Select skin:").addOptions(options));

                        await interaction.reply({
                            embeds: [secondaryEmbed("Which skin would you like to set a reminder for?")],
                            components: [row]
                        });
                    }

                    break;
                }
                case "alerts": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    let alerts = alertsForUser(interaction.user.id);
                    alerts.splice(0, 25); // todo create a page system when there are >25 alerts

                    // filter out alerts for deleted channels
                    const removedChannels = [];
                    for(const alert of alerts) {
                        if(removedChannels.includes(alert.channel_id)) continue;

                        const channel = await client.channels.fetch(alert.channel_id).catch(() => {});
                        if(!channel) {
                            removeAlertsInChannel(alert.channel_id);
                            removedChannels.push(alert.channel_id);
                        }
                    }
                    if(removedChannels) alerts = alertsForUser(interaction.user.id);

                    if(alerts.length === 0) {
                        return await interaction.reply({
                            embeds: [basicEmbed("**You don't have any alerts set up!** Use `/alert` to get started.")],
                            ephemeral: true
                        });
                    }

                    const auth = await authUser(interaction.user.id);
                    if(!auth.success) return await interaction.reply(authFailureMessage(interaction, auth, "**Your alerts won't work because you got logged out!** Please `/login` again."));

                    const emojiString = emojiToString(await VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel)) || "Price: ");

                    const alertFieldDescription = (channel_id, price) => {
                        return channel_id !== interaction.channel.id ? `in <#${channel_id}>` :
                            price ? `${emojiString} ${price}` :
                                config.fetchSkinPrices ? "Not for sale" : "Prices not shown";
                    }

                    if(alerts.length === 1) {
                        const alert = alerts[0];
                        const skin = await getSkin(alert.uuid);

                        return await interaction.reply({
                            embeds: [{
                                title: "You have one alert set up:",
                                color: VAL_COLOR_1,
                                description: `**${await skinNameAndEmoji(skin, interaction.channel)}**\n${alertFieldDescription(alert.channel_id, skin.price)}`,
                                thumbnail: {
                                    url: skin.icon
                                }
                            }],
                            components: [removeAlertActionRow(interaction.user.id, alert.uuid)],
                            ephemeral: true
                        });
                    }

                    // bring the alerts in this channel to the top
                    const alertPriority = (alert) => {
                        if(alert.channel_id === interaction.channel.id) return 2;
                        if(client.channels.cache.get(alert.channel_id).guild.id === interaction.guild.id) return 1;
                        return 0;
                    }
                    alerts.sort((alert1, alert2) => alertPriority(alert2) - alertPriority(alert1));

                    const embed = { // todo switch this to a "one embed per alert" message, kinda like /shop
                        title: "The alerts you currently have set up:",
                        color: VAL_COLOR_1,
                        footer: {
                            text: "Click on a button to remove the alert:"
                        },
                        fields: []
                    }
                    const buttons = [];

                    let n = 1;
                    for(const alert of alerts) {
                        const skin = await getSkin(alert.uuid);
                        embed.fields.push({
                            name: `**${n}.** ${await skinNameAndEmoji(skin, interaction.channel)}`,
                            value: alertFieldDescription(alert.channel_id, skin.price),
                            inline: false
                        });
                        buttons.push(removeAlertButton(interaction.user.id, alert.uuid).setLabel(`${n}.`));
                        n++;
                    }

                    const actionRows = [];
                    for(let i = 0; i < alerts.length; i += 5) {
                        const actionRow = new MessageActionRow();
                        for(let j = i; j < i + 5 && j < alerts.length; j++) {
                            actionRow.addComponents(buttons[j]);
                        }
                        actionRows.push(actionRow);
                    }

                    await interaction.reply({
                        embeds: [embed],
                        components: actionRows,
                        ephemeral: true
                    });

                    break;
                }
                case "login": {
                    await defer(interaction, true);

                    const username = interaction.options.get("username").value;
                    const password = interaction.options.get("password").value;

                    const login = await redeemUsernamePassword(interaction.user.id, username, password);

                    const user = getUser(interaction.user.id);
                    if(login.success && user) {
                        console.log(`${interaction.user.tag} logged in as ${user.username}`);
                        await interaction.followUp({
                            embeds: [basicEmbed(`Successfully logged in as **${user.username}**!`)],
                            ephemeral: true
                        });
                    } else await interaction.followUp(authFailureMessage(interaction, login, "Invalid username or password!"))

                    break;
                }
                case "2fa": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });
                    else if(!valorantUser.waiting2FA) return await interaction.reply({
                        embeds: [basicEmbed("**Not expecting a 2FA code!** Try `/login` if you're not logged in.")],
                        ephemeral: true
                    });

                    await defer(interaction, true);

                    const code = interaction.options.get("code").value.toString().padStart(6, '0');

                    const success = await redeem2FACode(interaction.user.id, code);

                    const user = getUser(interaction.user.id);
                    let embed;
                    if(success && user) {
                        console.log(`${interaction.user.tag} logged in as ${user.username} with 2FA code`);
                        embed = basicEmbed(`Successfully logged in as **${user.username}**!`);
                    } else {
                        console.log(`${interaction.user.tag} 2FA code failed`);
                        embed = basicEmbed("**Invalid 2FA code!** Please try again.");
                    }

                    await interaction.followUp({
                        embeds: [embed],
                        ephemeral: true
                    });

                    break;
                }
                case "cookies": {
                    await defer(interaction, true);

                    const cookies = interaction.options.get("cookies").value;

                    const success = await redeemCookies(interaction.user.id, cookies);

                    const user = getUser(interaction.user.id);
                    let embed;
                    if(success && user) {
                        console.log(`${interaction.user.tag} logged in as ${user.username} using cookies`)
                        embed = basicEmbed(`Successfully logged in as **${user.username}**!`);
                    } else {
                        console.log(`${interaction.user.tag} cookies login failed`);
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
                    if(!user) return await interaction.reply({
                        embeds: [basicEmbed("I can't forget you if you're not registered!")],
                        ephemeral: true
                    });

                    deleteUser(interaction.user.id);
                    removeAlertsFromUser(interaction.user.id);
                    console.log(`${interaction.user.tag} deleted their account`);

                    await interaction.reply({
                        embeds: [basicEmbed("Your account has been deleted from the database!")],
                        ephemeral: true
                    });
                    break;
                }
                case "battlepass": {
                    const valorantUser = getUser(interaction.user.id);
                    if(!valorantUser) return await interaction.reply({
                        embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                        ephemeral: true
                    });

                    await defer(interaction);

                    const batttlepass = await getBattlepassProgress(interaction.user.id);

                    if(!batttlepass.success) return await interaction.followUp(authFailureMessage(interaction, batttlepass, "**Could not fetch your battlepass**, most likely you got logged out. Try logging in again."));

                    await interaction.followUp({
                        embeds: [{ // move this to embed.js?
                            title: `**${valorantUser.username}**'s battlepass progress:`,
                            color: VAL_COLOR_1,
                            fields: [
                                {name: "Level", value: `${batttlepass.ProgressionLevelReached}`, inline: true},
                                {name: "XP", value: `${batttlepass.ProgressionTowardsNextLevel}`, inline: true}
                            ]
                        }]
                    });
                    console.log(`Sent ${interaction.user.tag}'s battlepass!`);

                    break;
                }
                default: {
                    await interaction.reply("Yer a wizard harry!");
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
                            embeds: [basicEmbed("**That's not your message!** Use `/alert` to set your own alert.")],
                            ephemeral: true
                        });
                    }

                    const chosenSkin = interaction.values[0].substr(5);
                    const skin = await getSkin(chosenSkin);

                    const otherAlert = alertExists(interaction.user.id, chosenSkin);
                    if(otherAlert) return await interaction.reply({
                        embeds: [basicEmbed(`You already have an alert for the **${skin.name}** in <#${otherAlert.channel_id}>!`)],
                        ephemeral: true
                    });

                    addAlert({
                        id: interaction.user.id,
                        uuid: chosenSkin,
                        channel_id: interaction.channel.id
                    });

                    await interaction.update({
                        embeds: [await skinChosenEmbed(skin, interaction.channel)],
                        components: [removeAlertActionRow(interaction.user.id, chosenSkin)]
                    });

                    break;
                }
                case "bundle-select": {
                    if(interaction.message.interaction.user.id !== interaction.user.id) {
                        return await interaction.reply({
                            embeds: [basicEmbed("**That's not your message!** Use `/bundle` to search for bundles.")],
                            ephemeral: true
                        });
                    }

                    const chosenBundle = interaction.values[0].substr(7);
                    const bundle = await getBundle(chosenBundle);

                    const emoji = await VPEmoji(interaction.guild, externalEmojisAllowed(interaction.channel));
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
                    embeds: [basicEmbed("**That's not your alert!** Use `/alerts` to manage your alerts.")],
                    ephemeral: true
                });

                const success = removeAlert(id, uuid);
                if(success) {
                    const skin = await getSkin(uuid);

                    await interaction.reply({
                        embeds: [basicEmbed(`Removed the alert for the **${await skinNameAndEmoji(skin, interaction.channel)}**!`)],
                        ephemeral: true
                    });

                    if(interaction.message.flags.has(MessageFlags.FLAGS.EPHEMERAL)) return; // message is ephemeral

                    if(interaction.message.interaction) { // if the message is an interaction, aka is the response to /alert
                        await interaction.message.delete().catch(() => {});
                    } else { // the message is an automatic alert
                        const actionRow = removeAlertActionRow(interaction.user.id, uuid);
                        actionRow.components[0].setDisabled(true).setLabel("Removed");

                        await interaction.message.edit({components: [actionRow]}).catch(() => {});
                    }
                } else {
                    await interaction.reply({embeds: [basicEmbed("That alert doesn't exist anymore!")], ephemeral: true});
                }
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
    const message = `:no_entry_sign: **There was an error trying to do that!** I blame Riot.\n\`${e.message}\``;
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