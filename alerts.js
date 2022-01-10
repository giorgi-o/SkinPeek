import {getUserList} from "./Valorant/auth.js";
import {getShop} from "./Valorant/skins.js";
import {skinAlerts} from "./SkinPeek.js";
import fs from "fs";

let alerts = [];

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
            if(positiveAlerts) skinAlerts(positiveAlerts, shop.expires);
        });
    }
}