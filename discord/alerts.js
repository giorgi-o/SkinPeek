import {removeAlertActionRow, skinNameAndEmoji} from "../misc/util.js";
import {getUserList} from "../valorant/auth.js";
import {getOffers} from "../valorant/shop.js";
import {getSkin} from "../valorant/cache.js";
import {VAL_COLOR_1} from "./embed.js"
import fs from "fs";
import {VAL_COLOR_1} from "./embed.js";

let alerts = [];

let client;
export const setClient = (theClient) => client = theClient;

/* Alert format: {
 *     id: discord user id
 *     uuid: skin uuid
 *     channel_id: discord text channel id the alert was sent in
 * }
 * There should only be one alert per ID/UUID pair, aka each user can have one alert per skin.
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

export const checkAlerts = () => {
    if(!alerts) return;
    console.debug("Checking new shop skins for alerts...");

    try {
        for(const id of getUserList()) {
            const userAlerts = alerts.filter(alert => alert.id === id);
            if(!userAlerts.length) continue;

            getOffers(id).then(resp => {
                if(!resp.success) {
                    if(resp.maintenance) return; // retry in a few hours?
                    const channelsSent = [];
                    for(const alert of alerts) {
                        if(!channelsSent.includes(alert.channel_id)) {
                            sendCredentialsExpired(alert);
                            channelsSent.push(alert.channel_id);
                        }
                    }
                    return;
                }

                const positiveAlerts = userAlerts.filter(alert => resp.offers.includes(alert.uuid));
                if(positiveAlerts.length) sendAlert(positiveAlerts, resp.expires);
            });
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

        const skin = await getSkin(alert.uuid);
        await channel.send({
            content: `<@${alert.id}>`,
            embeds: [{
                description: `:tada: <@${alert.id}> The **${await skinNameAndEmoji(skin, channel)}** is in your daily shop!\nIt will be gone <t:${expires}:R>.`,
                color: VAL_COLOR_1,
                thumbnail: {
                    url: skin.icon
                }
            }],
            components: [removeAlertActionRow(alert.id, alert.uuid)]
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
        if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again.`)
        return removeAlertsInChannel(alert.channel_id);
    }

    await channel.send({
        content: `<@${alert.id}>`,
        embeds: [{
            description: `**<@${alert.id}> I couldn't check your alerts!** Did you change your password?\nPlease \`/login\` again.`,
            color: VAL_COLOR_1,
        }]
    }).catch(async e => {
        console.error(`Could not send message in #${channel.name}! Do I have the right role?`);

        try { // try to log the alert to the console
            const user = await client.users.fetch(alert.id).catch(() => {});
            if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again.`);
        } catch(e) {}

        console.error(e);
    });
}
