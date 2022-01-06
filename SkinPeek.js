import {Client, Intents, MessageActionRow, MessageButton, MessageFlags, MessageSelectMenu} from "discord.js";
import {getBalance, getSkin, getShop, refreshSkinList, searchSkin} from "./Valorant/skins.js";
import {authUser, deleteUser, getUser, loadUserData, redeemCookies, redeemUsernamePassword} from "./Valorant/auth.js";
import {loadConfig} from "./config.js";
import {RadEmoji, VPEmoji} from "./emoji.js";
import cron from "node-cron";
import {
    addAlert,
    alertExists, alertsForUser,
    checkAlerts,
    loadAlerts,
    removeAlert,
    removeAlertsFromUser,
    removeAlertsInChannel
} from "./alerts.js";

/* TODO list:
 * (done) Balance
 * (done) Auto fetch skins on startup
 * (done) Skin notifier/reminder
 * Auto check for new Valorant version every hour
 * Password encryptor
 * See current bundles
 * Inspect weapon skin (all 4 levels + videos + radianite upgrade price)
 * Option to send shop automatically every day
 * Admin commands (delete user, see/edit everyone's alerts, etc.)
 */

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}); // what intents does the bot need

const VAL_COLOR_1 = 0xFD4553, VAL_COLOR_2 = 0x0F1923;

client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    console.debug("Loading skins...");
    refreshSkinList().then(() => console.log("Skins loaded!"));

    // check alerts every day at 00:00:10 GMT
    cron.schedule("10 0 0 * * *", checkAlerts, {timezone: "GMT"}); // todo make time configurable
});

const commands = [
    {
        name: "skins",
        description: "Show your current daily shop"
    },
    {
        name: "shop",
        description: "Show your current daily shop"
    },
    {
        name: "balance",
        description: "Show how many Valorant points you have in your account"
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
            case "skins":
            case "shop": {
                const valorantUser = getUser(interaction.user.id);
                if(!valorantUser) return await interaction.reply({
                    embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                    ephemeral: true
                });

                // start uploading emoji now
                const emojiPromise = VPEmoji(interaction.guild);

                await interaction.deferReply();

                const shop = await getShop(interaction.user.id);

                if(!shop) return await interaction.followUp({
                    embeds: [basicEmbed("Could not fetch your shop, most likely you got logged out. Try logging in again.")],
                    ephemeral: true
                });

                const embeds = [{
                    description: `Daily shop for **${valorantUser.username}** (new shop <t:${Math.floor(Date.now() / 1000) + shop.expires}:R>)`,
                    color: VAL_COLOR_1
                }];

                const emojiString = (await emojiPromise) || "Price:";

                for(const uuid of shop.offers) {
                    const item = await getSkin(uuid, interaction.user.id);
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
                console.log(`Sent ${interaction.user.tag}'s shop!`);

                break;
            }
            case "balance": {
                const valorantUser = getUser(interaction.user.id);
                if(!valorantUser) return await interaction.reply({
                    embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                    ephemeral: true
                });

                await interaction.deferReply();

                const VPEmojiPromise = VPEmoji(interaction.guild);
                const RadEmojiPromise = RadEmoji(interaction.guild);

                const balance = await getBalance(interaction.user.id);

                if(balance) {
                    const VPEmoji = (await VPEmojiPromise) || "Valorant Points:";
                    const RadEmoji = (await RadEmojiPromise) || "Radianite:";
                    await interaction.followUp({
                        embeds: [{
                            title: `**${valorantUser.username}**'s wallet:`,
                            color: VAL_COLOR_1,
                            fields: [
                                {name: "Valorant Points", value: `${VPEmoji} ${balance.vp}`, inline: true},
                                {name: "Radianite", value: `${RadEmoji} ${balance.rad}`, inline: true}
                            ]
                        }]
                    });
                    console.log(`Sent ${interaction.user.tag}'s balance!`);
                } else await interaction.followUp({
                    embeds: [basicEmbed("**Could not fetch your balance**, most likely you got logged out. Try logging in again.")]
                });

                break;
            }
            case "alert": {
                const valorantUser = getUser(interaction.user.id);
                if(!valorantUser) return await interaction.reply({
                    embeds: [basicEmbed("**You're not registered with the bot!** Try `/login`.")],
                    ephemeral: true
                });

                const searchQuery = interaction.options.get("skin").value
                const searchResults = searchSkin(searchQuery); // filter for skins they already have

                // filter out results for which the user already has an alert set up
                const filteredResults = [];
                for(const result of searchResults) {
                    const otherAlert = alertExists(interaction.user.id, result.item.uuid);
                    if(otherAlert) { // user already has an alert for this skin
                        // maybe it's in a now deleted channel?
                        const otherChannel = await client.channels.fetch(otherAlert.channel_id).catch(() => {});
                        if(!otherChannel || otherChannel.deleted) {
                            removeAlertsInChannel(otherAlert.channel_id);
                            filteredResults.push(result);
                        }
                    } else filteredResults.push(result);
                }

                if(filteredResults.length === 0) {
                    if(searchResults.length === 0) return await interaction.reply({embeds: [basicEmbed("**Couldn't find a skin with that name!** Check the spelling and try again.")], ephemeral: true});

                    const skin = searchResults[0].item;
                    const otherAlert = alertExists(interaction.user.id, skin.uuid);
                    return await interaction.reply({
                        embeds: [basicEmbed(`You already have an alert for the **${skin.name}** in <#${otherAlert.channel_id}>!`)],
                        ephemeral: true
                    });
                } else if(filteredResults.length === 1 || filteredResults[0].item.name.toLowerCase() === searchQuery.toLowerCase()) {
                    const skin = filteredResults[0].item;

                    addAlert({
                        id: interaction.user.id,
                        uuid: skin.uuid,
                        channel_id: interaction.channel.id
                    });

                    return await interaction.reply({embeds: [skinChosenEmbed(skin.name, skin.icon)], components: [removeAlertActionRow(interaction.user.id, skin.uuid)]});
                } else {
                    const row = new MessageActionRow();
                    const options = filteredResults.splice(0, 25).map(result => {
                        return {
                            label: result.item.name,
                            value: `skin-${result.item.uuid}`
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
                        embeds: [basicEmbed("**You do not have any alerts set up!** Use `/alert` to get started.")],
                        ephemeral: true
                    });
                }

                const success = await authUser(interaction.user.id);
                if(!success) return await interaction.reply({
                    embeds: [basicEmbed("**Your alerts won't work because you got logged out!** Please `/login` again.")],
                    ephemeral: true
                });

                const emojiString = await VPEmoji(interaction.guild) || "Price: ";

                const alertFieldDescription = (channel_id, price) => {
                    return channel_id !== interaction.channel.id ? `in <#${channel_id}>` :
                        price ? `${emojiString} ${price}` : "Not for sale";
                }

                if(alerts.length === 1) {
                    const alert = alerts[0];
                    const skin = await getSkin(alert.uuid, interaction.user.id);

                    return await interaction.reply({
                        embeds: [{
                            title: "You have one alert set up:",
                            color: VAL_COLOR_1,
                            description: `**${skin.name}**\n${alertFieldDescription(alert.channel_id, skin.price)}`,
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

                const embed = {
                    title: "The alerts you currently have set up:",
                    color: VAL_COLOR_1,
                    footer: {
                        text: "Click on a button to remove the alert"
                    },
                    fields: []
                }
                const buttons = [];

                const inlineFields = alerts.length >= 6;

                let n = 1;
                for(const alert of alerts) {
                    const skin = await getSkin(alert.uuid, interaction.user.id);
                    embed.fields.push({
                        name: `**${n}.** ${skin.name}`,
                        value: alertFieldDescription(alert.channel_id, skin.price),
                        inline: inlineFields
                    });
                    buttons.push(removeAlertButton(interaction.user.id, alert.uuid).setLabel(`${n}.`).setEmoji(""));
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
                await interaction.deferReply({ephemeral: true});

                const username = interaction.options.get("username").value;
                const password = interaction.options.get("password").value;

                const success = await redeemUsernamePassword(interaction.user.id, username, password);

                const user = getUser(interaction.user.id);
                let embed;
                if(success && user) {
                    console.log(`${interaction.user.tag} logged in as ${user.username}`);
                    embed = basicEmbed(`Successfully logged in as **${user.username}**!`);
                } else {
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
            default: {
                await interaction.reply("Yer a wizard harry!");
                break;
            }
        }
    } else if(interaction.isSelectMenu()) {
        switch (interaction.customId) {
            case "skin-select": {
                if(interaction.message.interaction.user.id !== interaction.user.id) {
                    return await interaction.reply({embeds: [basicEmbed("**That's not your message!** Use `/alert` to set your own alert.")], ephemeral: true});
                }

                const chosenSkin = interaction.values[0].substr(5);

                const skin = await getSkin(chosenSkin);

                addAlert({
                    id: interaction.user.id,
                    uuid: chosenSkin,
                    channel_id: interaction.channel.id
                });

                await interaction.update({embeds: [skinChosenEmbed(skin.name, skin.icon)], components: [removeAlertActionRow(interaction.user.id, chosenSkin)]});
            }
        }
    } else if(interaction.isButton()) {
        if(interaction.customId.startsWith("removealert/")) {
            const [, uuid, id] = interaction.customId.split('/');

            if(id !== interaction.user.id) return await interaction.reply({embeds: [basicEmbed("**That's not your alert!** Use `/alerts` to manage your alerts.")], ephemeral: true});

            const success = removeAlert(id, uuid);
            if(success) {
                const skin = await getSkin(uuid);

                await interaction.reply({embeds: [basicEmbed(`Removed the alert for the **${skin.name}**!`)], ephemeral: true});

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
    }
});

client.on("channelDelete", channel => {
    removeAlertsInChannel(channel.id);
})

const basicEmbed = (content) => {
    return {
        description: content,
        color: VAL_COLOR_1
    }
}

const secondaryEmbed = (content) => {
    return {
        description: content,
        color: VAL_COLOR_2
    }
}

const skinChosenEmbed = (name, skinIcon) => {
    return {
        description: `Successfully set an alert for **${name}**!`,
        color: VAL_COLOR_1,
        thumbnail: {
            url: skinIcon
        }
    }
}

export const skinAlerts = async (alerts, expires) => {
    const expiresTimestamp = Math.floor(Date.now() / 1000) + expires;

    for(let i = 0; i < alerts.length; i++) {
        let alert = alerts[i];

        const channel = await client.channels.fetch(alert.channel_id).catch(() => {});
        if(!channel || channel.deleted) {
            removeAlertsInChannel(alert.channel_id);
            while(i < alerts.length && (i === alerts.length - 1 || alerts[i].channel_id === alerts[i+1].channel_id)) {
                i++;
            }
            continue;
        }

        const skin = await getSkin(alert.uuid);
        await channel.send({
            content: `<@${alert.id}>`,
            embeds: [{
                description: `:tada: <@${alert.id}> The **${skin.name}** is in your daily shop!\nIt will be gone <t:${expiresTimestamp}:R>.`,
                color: VAL_COLOR_1,
                thumbnail: {
                    url: skin.icon
                }
            }],
            components: [removeAlertActionRow(alert.id, alert.uuid)]
        }).catch(async e => {
            console.error(`Could not send alert message in #${channel.name}! Do I have the right role?`);

            try { // try to log the alert to the console
                const user = await fetch(alert.id).catch(() => {});
                if(user) console.error(`Please tell ${user.tag} that the ${skin.name} is in their item shop!`);
            } catch(e) {}

            console.error(e);
        });
    }
}

const removeAlertButton = (id, uuid) => new MessageButton().setCustomId(`removealert/${uuid}/${id}`).setStyle("DANGER").setLabel("Remove").setEmoji("✖");
const removeAlertActionRow = (id, uuid) => new MessageActionRow().addComponents(removeAlertButton(id, uuid));

loadUserData();
loadAlerts();
const config = loadConfig();
if(config) {
    client.login(config.token);
    console.log("Logging in...");
}
