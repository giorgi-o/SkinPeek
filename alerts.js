import {getUserList} from "./Valorant/auth.js";
import {getShop, getSkin} from "./Valorant/skins.js";
import fs from "fs";
import {removeAlertActionRow, skinNameAndEmoji, VAL_COLOR_1} from "./util.js";

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

export const loadAlerts = (filename="alerts.json") => {
    try {
        alerts = JSON.parse(fs.readFileSync(filename).toString());
        saveAlerts(filename);
    } catch(e) {}
}

const saveAlerts = (filename="alerts.json") => {
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

    for(const id of getUserList()) {
        const userAlerts = alerts.filter(alert => alert.id === id);
        if(!userAlerts) continue;

        getShop(id).then(shop => {
            const positiveAlerts = userAlerts.filter(alert => shop.offers.includes(alert.uuid));
            if(positiveAlerts) sendAlert(positiveAlerts, shop.expires);
        });
    }
}

// function needs to be here instead of SkinPeek.js to avoid circular dependency
const sendAlert = async (alerts, expires) => {
    console.debug(`Sending alerts...`);

    const expiresTimestamp = Math.floor(Date.now() / 1000) + expires;

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
                description: `:tada: <@${alert.id}> The **${await skinNameAndEmoji(skin, channel)}** is in your daily shop!\nIt will be gone <t:${expiresTimestamp}:R>.`,
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