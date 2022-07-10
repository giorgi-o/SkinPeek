import {discordTag, fetchChannel, getChannelGuildId, removeAlertActionRow, skinNameAndEmoji, wait} from "../misc/util.js";
import {deleteUserAuth, getUser, getUserList} from "../valorant/auth.js";
import {getOffers} from "../valorant/shop.js";
import {getSkin} from "../valorant/cache.js";
import {basicEmbed, VAL_COLOR_1} from "./embed.js";
import {client} from "./bot.js";
import config from "../misc/config.js";
import {s} from "../misc/languages.js";
import {saveUser} from "../valorant/accountSwitcher.js";
import {sendShardMessage} from "../misc/shardMessage.js";


/* Alert format: {
 *     uuid: skin uuid
 *     channel_id: discord text channel id the alert was sent in
 * }
 * Each user should have one alert per skin.
 */

export const addAlert = (id, alert) => {
    const user = getUser(id);
    if(!user) return;

    user.alerts.push(alert);
    saveUser(user);
}

export const alertsForUser = (id) => {
    const user = getUser(id);
    if(user) return user.alerts;
}

export const alertExists = (id, uuid) => {
    return alertsForUser(id).find(alert => alert.uuid === uuid) || false;
}

export const filteredAlertsForUser = async (interaction) => {
    let alerts = alertsForUser(interaction.user.id);

    // bring the alerts in this channel to the top
    const alertPriority = (alert) => {
        if(alert.channel_id === interaction.channelId) return 2;
        const channel = client.channels.cache.get(alert.channel_id)
        if(interaction.guild && channel && channel.client.channels.cache.get(alert.channel_id).guildId === interaction.guild.id) return 1;
        return 0;
    }
    alerts.sort((alert1, alert2) => alertPriority(alert2) - alertPriority(alert1));

    return alerts;
}

export const alertsPerChannelPerGuild = async () => {
    const guilds = {};
    for(const id of getUserList()) {
        const alerts = alertsForUser(id);
        for(const alert of alerts) {
            const guildId = await getChannelGuildId(alert.channel_id);

            if(!(guildId in guilds)) guilds[guildId] = {};
            if(!(alert.channel_id in guilds[guildId])) guilds[guildId][alert.channel_id] = 1;
            else guilds[guildId][alert.channel_id]++;
        }
    }
    return guilds;
}

export const removeAlert = (id, uuid) => {
    const user = getUser(id);
    const alertCount = user.alerts.length;
    user.alerts = user.alerts.filter(alert => alert.uuid !== uuid);
    saveUser(user);
    return alertCount > user.alerts.length;
}

export const checkAlerts = async () => {
    if(client.shard && !client.shard.ids.includes(0)) return; // only run on the first shard

    console.log("Checking new shop skins for alerts...");

    try {
        for(const id of getUserList()) {
            try {
                const userAlerts = alertsForUser(id);
                if(!userAlerts || !userAlerts.length) continue;

                const offers = await getOffers(id);
                if(!offers.success) {
                    if(offers.maintenance) return; // retry in a few hours?

                    // user login is invalid
                    const channelsSent = [];
                    for(const alert of userAlerts) {
                        if(!channelsSent.includes(alert.channel_id)) {
                            await sendCredentialsExpired(id, alert);
                            channelsSent.push(alert.channel_id);
                        }
                    }
                    deleteUserAuth(getUser(id));
                    await wait(config.delayBetweenAlerts);
                    continue;
                }

                const positiveAlerts = userAlerts.filter(alert => offers.offers.includes(alert.uuid));
                if(positiveAlerts.length) await sendAlert(id, positiveAlerts, offers.expires);
            } catch(e) {
                console.error("There was an error while trying to fetch and send alerts for user " + discordTag(id));
                console.error(e);
            }

            await wait(config.delayBetweenAlerts); // to prevent being ratelimited
        }
    } catch(e) {
        // should I send messages in the discord channels?
        console.error("There was an error while trying to send alerts!");
        console.error(e);
    }
}

export const sendAlert = async (id, alerts, expires, tryOnOtherShard=true) => {
    console.log(`Sending alerts...`);

    for(const alert of alerts) {
        const valorantUser = getUser(id);
        if(!valorantUser) return;

        const channel = await fetchChannel(alert.channel_id);
        if(!channel) {
            if(client.shard && tryOnOtherShard) {
                sendShardMessage({
                    type: "alert",
                    id, alert, expires
                });
            }
            continue;
        }

        const skin = await getSkin(alert.uuid);
        await channel.send({
            content: `<@${id}>`,
            embeds: [{
                description: s(valorantUser.locale).info.ALERT_HAPPENED.f({u: id, s: await skinNameAndEmoji(skin, channel, valorantUser.locale), t: expires}),
                color: VAL_COLOR_1,
                thumbnail: {
                    url: skin.icon
                }
            }],
            components: [removeAlertActionRow(id, alert.uuid, s(valorantUser.locale).info.REMOVE_ALERT_BUTTON)]
        }).catch(async e => {
            console.error(`Could not send alert message in #${channel.name}! Do I have the right role?`);

            try { // try to log the alert to the console
                const user = await client.users.fetch(id).catch(() => {});
                if(user) console.error(`Please tell ${user.tag} that the ${skin.name} is in their item shop!`);
            } catch(e) {}

            console.error(e);
        });
    }
}

export const sendCredentialsExpired = async (id, alert, tryOnOtherShard=true) => {
    const channel = await fetchChannel(alert.channel_id);
    if(!channel) {
        if(client.shard && tryOnOtherShard) {
            sendShardMessage({
                type: "alertCredentialsExpired",
                id, alert
            });
        }

        const user = await client.users.fetch(id).catch(() => {});
        if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again.`);
        return;
    }

    if(channel.guild) {
        const memberInGuild = await channel.guild.members.fetch(id).catch(() => {});
        if(!memberInGuild) return; // the user is no longer in that guild
    }

    const valorantUser = getUser(id);
    if(!valorantUser) return;

    await channel.send({
        content: `<@${id}>`,
        embeds: [{
            description: s(valorantUser.locale).error.AUTH_ERROR_ALERTS_HAPPENED.f({u: id}),
            color: VAL_COLOR_1,
        }]
    }).catch(async e => {
        console.error(`Could not send message in #${channel.name}! Do I have the right role?`);

        try { // try to log the alert to the console
            const user = await client.users.fetch(id).catch(() => {});
            if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again. Also tell them that they should fix their perms.`);
        } catch(e) {}

        console.error(e);
    });
}

export const testAlerts = async (interaction) => {
    try {
        const channel = interaction.channel || await fetchChannel(interaction.channel_id);
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
