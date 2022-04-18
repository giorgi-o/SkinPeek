import {removeAlertActionRow, skinNameAndEmoji, wait} from "../misc/util.js";
import {deleteUser, getUser, getUserList} from "../valorant/auth.js";
import {getOffers} from "../valorant/shop.js";
import {getSkin} from "../valorant/cache.js";
import fs from "fs";
import {basicEmbed, VAL_COLOR_1} from "./embed.js";
import config from "../misc/config.js";
import {s} from "../misc/languages.js";

let alerts = [];

let client;
export const setClient = (theClient) => client = theClient;

/* Alert format: {
 *     id: discord user id
 *     uuid: skin uuid
 *     channel_id: discord text channel id the alert was sent in
 * }
 * There should only be one alert per ID/UUID pair, i.e. each user can have one alert per skin.
 */

export const loadAlerts = (filename="data/alerts.json") => {
    try {
        alerts = JSON.parse(fs.readFileSync(filename).toString());
        saveAlerts(filename);
    } catch(e) {}
}

const saveAlerts = (filename="data/alerts.json") => {
    fs.writeFileSync(filename, JSON.stringify(alerts, null, 2));
}

export const addAlert = (alert) => {
    alerts.push(alert);
    saveAlerts();
}

export const alertExists = (id, uuid) => {
    return alerts.filter(alert => alert.id === id && alert.uuid === uuid)[0] || false;
}

export const alertsForUser = (id) => {
    return alerts.filter(alert => alert.id === id);
}

export const filteredAlertsForUser = async (interaction) => {
    let alerts = alertsForUser(interaction.user.id);

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
    if(removedChannels.length) alerts = alertsForUser(interaction.user.id);

    // bring the alerts in this channel to the top
    const alertPriority = (alert) => {
        if(alert.channel_id === interaction.channelId) return 2;
        if(interaction.guild && client.channels.cache.get(alert.channel_id).guildId === interaction.guild.id) return 1;
        return 0;
    }
    alerts.sort((alert1, alert2) => alertPriority(alert2) - alertPriority(alert1));

    return alerts;
}

export const alertsForGuild = async (id) => {
    const alertsInGuild = [];

    const guild = await client.guilds.fetch(id);
    for(const alert of alerts) {
        const channel = await client.channels.fetch(alert.channel_id)
        if(channel.guildId === guild.id)
            alertsInGuild.push(alert);
    }

    return alertsInGuild;
}

export const removeAlert = (id, uuid) => {
    const alertCount = alerts.length;
    alerts = alerts.filter(alert => alert.id !== id || alert.uuid !== uuid);
    saveAlerts();
    return alertCount > alerts.length;
}

export const removeAlertsFromUser = (id) => {
    alerts = alerts.filter(alert => alert.id !== id);
    saveAlerts();
}

export const removeAlertsInChannel = (channel_id) => {
    alerts = alerts.filter(alert => alert.channel_id !== channel_id);
    saveAlerts();
}

export const checkAlerts = async () => {
    if(!alerts) return;
    console.debug("Checking new shop skins for alerts...");

    try {
        for(const id of getUserList()) {
            const userAlerts = alerts.filter(alert => alert.id === id);
            if(!userAlerts.length) continue;

            const offers = await getOffers(id);
            if(!offers.success) {
                if(offers.maintenance) return; // retry in a few hours?

                // user login is invalid
                const channelsSent = [];
                for(const alert of userAlerts) {
                    if(!channelsSent.includes(alert.channel_id)) {
                        await sendCredentialsExpired(alert);
                        channelsSent.push(alert.channel_id);
                    }
                }
                deleteUser(id);
                await wait(config.delayBetweenAlerts);
                continue;
            }

            const positiveAlerts = userAlerts.filter(alert => offers.offers.includes(alert.uuid));
            if(positiveAlerts.length) await sendAlert(positiveAlerts, offers.expires);

            await wait(config.delayBetweenAlerts); // to prevent being ratelimited
        }
    } catch(e) {
        // should I send messages in the discord channels?
        console.error("There was an error while trying to send alerts!");
        console.error(e);
    }
}

const sendAlert = async (alerts, expires) => {
    console.debug(`Sending alerts...`);

    for(let i = 0; i < alerts.length; i++) {
        let alert = alerts[i];

        const channel = await client.channels.fetch(alert.channel_id).catch(() => {});
        if(!channel) {
            removeAlertsInChannel(alert.channel_id);
            while(i < alerts.length && (i === alerts.length - 1 || alerts[i].channel_id === alerts[i+1].channel_id)) {
                i++;
            }
            continue;
        }

        const valorantUser = getUser(alert.id);
        const skin = await getSkin(alert.uuid);
        await channel.send({
            content: `<@${alert.id}>`,
            embeds: [{
                description: s(valorantUser.locale).info.ALERT_HAPPENED.f({u: alert.id, s: await skinNameAndEmoji(skin, channel, valorantUser.locale), t: expires}),
                color: VAL_COLOR_1,
                thumbnail: {
                    url: skin.icon
                }
            }],
            components: [removeAlertActionRow(alert.id, alert.uuid, s(valorantUser.locale).info.REMOVE_ALERT_BUTTON)]
        }).catch(async e => {
            console.error(`Could not send alert message in #${channel.name}! Do I have the right role?`);

            try { // try to log the alert to the console
                const user = await client.users.fetch(alert.id).catch(() => {});
                if(user) console.error(`Please tell ${user.tag} that the ${skin.name} is in their item shop!`);
            } catch(e) {}

            console.error(e);
        });
    }
}

const sendCredentialsExpired = async (alert) => {
    const channel = await client.channels.fetch(alert.channel_id).catch(() => {});
    if(!channel) {
        const user = await client.users.fetch(alert.id).catch(() => {});
        if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again.`);
        return removeAlertsInChannel(alert.channel_id);
    }

    const memberInGuild = await channel.guild.members.fetch(alert.id).catch(() => {});
    if(!memberInGuild) return;

    const valorantUser = getUser(alert.id);
    await channel.send({
        content: `<@${alert.id}>`,
        embeds: [{
            description: s(valorantUser.locale).error.AUTH_ERROR_ALERTS_HAPPENED.f({u: alert.id}),
            color: VAL_COLOR_1,
        }]
    }).catch(async e => {
        console.error(`Could not send message in #${channel.name}! Do I have the right role?`);

        try { // try to log the alert to the console
            const user = await client.users.fetch(alert.id).catch(() => {});
            if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again. Also tell them that they should fix their perms.`);
        } catch(e) {}

        console.error(e);
    });
}

export const testAlerts = async (interaction) => {
    try {
        const channel = interaction.channel || await client.channels.fetch(interaction.channel_id);
        await channel.send({
            embeds: [basicEmbed(s(interaction).info.ALERT_TEST)]
        });
        return true;
    } catch(e) {
        console.error(`${interaction.user.tag} tried to /testalerts, but failed!`);
        if(e.code === 50013) console.error("Failed with 'Missing Access' error");
        else if(e.code === 50001) console.error("Failed with 'Missing Permissions' error");
        else console.error(e);
        return false;
    }
}
