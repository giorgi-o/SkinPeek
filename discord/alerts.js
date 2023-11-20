import {
    discordTag,
    fetchChannel,
    getChannelGuildId,
    removeAlertActionRow,
    removeDupeAlerts,
    skinNameAndEmoji,
    wait,
    removeAlertButton
} from "../misc/util.js";
import {authUser, deleteUserAuth, getUser, getUserList} from "../valorant/auth.js";
import {getOffers} from "../valorant/shop.js";
import {getSkin} from "../valorant/cache.js";
import {alertsPageEmbed, authFailureMessage, basicEmbed, renderOffers, VAL_COLOR_1, skinEmbed} from "./embed.js";
import {client} from "./bot.js";
import config from "../misc/config.js";
import {l, s} from "../misc/languages.js";
import {readUserJson, saveUser} from "../valorant/accountSwitcher.js";
import {sendShardMessage} from "../misc/shardMessage.js";
import {VPEmoji} from "./emoji.js";
import {getSetting} from "../misc/settings.js";
import { ActionRowBuilder } from "discord.js";

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

export const alertsForUser = (id, account=null) => {
    if(account === -1) { // -1 to get all alerts for user across accounts
        const user = readUserJson(id);
        if(!user) return [];

        return user.accounts.map(account => account.alerts).flat();
    }

    const user = getUser(id, account);
    if(user) return user.alerts;
    return [];
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
        const alerts = alertsForUser(id, -1);
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
        let shouldWait = false;

        for(const id of getUserList()) {
            try {
                let credsExpiredAlerts = false;

                const userJson = readUserJson(id);
                if(!userJson) continue;

                const accountCount = userJson.accounts.length;
                for(let i = 1; i <= accountCount; i++) {

                    const rawUserAlerts = alertsForUser(id, i);
                    const dailyShopChannel = getSetting(id, "dailyShop");
                    if(!rawUserAlerts?.length && !dailyShopChannel) continue;
                    if(!rawUserAlerts?.length && dailyShopChannel && i !== userJson.currentAccount) continue;

                    if(shouldWait) {
                        await wait(config.delayBetweenAlerts); // to prevent being ratelimited
                        shouldWait = false;
                    }

                    const valorantUser = getUser(id, i);
                    const discordUser = client.users.cache.get(id);
                    const discordUsername = discordUser ? discordUser.username : id;
                    console.log(`Checking user ${discordUsername}'s ${valorantUser.username} account (${i}/${accountCount}) for alerts...`);

                    const userAlerts = removeDupeAlerts(rawUserAlerts);
                    if(userAlerts.length !== rawUserAlerts.length) {
                        valorantUser.alerts = userAlerts;
                        saveUser(valorantUser, i);
                    }

                    let offers;
                    do { // retry loop in case of rate limit or maintenance
                        offers = await getOffers(id, i);
                        shouldWait = valorantUser.auth && !offers.cached;

                        if(!offers.success) {
                            if(offers.maintenance) {
                                console.log("Valorant servers are under maintenance, waiting 15min before continuing alert checks...");
                                await wait(15 * 60 * 1000);
                            }

                            else if(offers.rateLimit) {
                                const waitMs = offers.rateLimit - Date.now();
                                console.error(`I got ratelimited while checking alerts for user ${id} #${i} for ${Math.floor(waitMs / 1000)}s!`);
                                await wait(waitMs);
                            }

                            else {
                                if(!credsExpiredAlerts) {
                                    if(valorantUser.authFailures < config.authFailureStrikes) {
                                        valorantUser.authFailures++;
                                        credsExpiredAlerts = userAlerts;
                                    }
                                }

                                deleteUserAuth(valorantUser);
                                break;
                            }
                        }

                    } while(!offers.success);

                    if(offers.success && offers.offers) {
                        if(dailyShopChannel && i === userJson.currentAccount) await sendDailyShop(id, offers, dailyShopChannel, valorantUser);

                        const positiveAlerts = userAlerts.filter(alert => offers.offers.includes(alert.uuid));
                        if(positiveAlerts.length) await sendAlert(id, i, positiveAlerts, offers.expires);
                    }
                }

                if(credsExpiredAlerts) {
                    // user login is invalid
                    const channelsSent = [];
                    for(const alert of credsExpiredAlerts) {
                        if(!channelsSent.includes(alert.channel_id)) {
                            await sendCredentialsExpired(id, alert);
                            channelsSent.push(alert.channel_id);
                        }
                    }
                }
            } catch(e) {
                console.error("There was an error while trying to fetch and send alerts for user " + discordTag(id));
                console.error(e);
            }
        }

        console.log("Finished checking alerts!");
    } catch(e) {
        // should I send messages in the discord channels?
        console.error("There was an error while trying to send alerts!");
        console.error(e);
    }
}

export const sendAlert = async (id, account, alerts, expires, tryOnOtherShard=true, alertsLength=alerts.length) => {
    const user = client.users.cache.get(id);
    const username = user ? user.username : id;

    let filteredAlerts = {};
    /* filteredAlerts looks like this:
    {
        "channelId1": [{uuid: "skinUUID", channel_id: "channelId1"}, {uuid: "skinUUID2", channel_id: "channelId1"}],
        "channelId2": [{uuid: "skinUUID3", channel_id: "channelId2"}],
        "channelId3": [{uuid: "skinUUID5", channel_id: "channelId3"}]
    }
    */
    const valorantUser = getUser(id, account);
    if(!valorantUser) return;

    if(tryOnOtherShard)
    for(const alert of alerts) {
        if(!filteredAlerts[alert.channel_id]) filteredAlerts[alert.channel_id] = [alert];
        else filteredAlerts[alert.channel_id].push(alert);
    }
    else filteredAlerts[alerts[0].channel_id] = alerts

    for(const channel_id of Object.keys(filteredAlerts)) {

        const message = {
            content:  `<@${id}>`,
            embeds: [],
            components: []
        };
        const buttons = [];
        const alertsArray = filteredAlerts[channel_id];

        const channel = await fetchChannel(channel_id);
        if(!channel) {
            if(client.shard && tryOnOtherShard) {
                sendShardMessage({
                    type: "alert",
                    alerts: filteredAlerts[channel_id],
                    id, account, expires, alertsLength
                });
            }
            continue;
        }

        console.log(`Sending alert for user ${username}...`);

        if(alertsArray.length === alertsLength && alertsLength > 1)
            message.embeds.push({
                description: s(valorantUser).info.MULTIPLE_ALERT_HAPPENED.f({i: id, u: valorantUser.username, t: expires}, id),
                color: VAL_COLOR_1
            });
            else if(alertsArray.length < alertsLength)
            message.embeds.push({
                description: s(valorantUser).info.MULTIPLE_ALERT_HAPPENED_ON_DIFF_CHANNEL.f({i: id, u: valorantUser.username, t: expires, cid: client.application.commands.cache.find(c => c.name === "alerts").id}, id),
                color: VAL_COLOR_1
            });
        for(const alert of alertsArray) {
            const skin = await getSkin(alert.uuid);
            console.log(`User ${valorantUser.username} has the skin ${l(skin.names)} in their shop!`); //only we see it, no need to see the skin name in another language
            if(alertsLength === 1){
                message.embeds.push({
                    description: s(valorantUser).info.ALERT_HAPPENED.f({i: id, u: valorantUser.username, s: await skinNameAndEmoji(skin, channel, valorantUser), t: expires}, id),
                    color: VAL_COLOR_1,
                    thumbnail: {
                        url: skin.icon
                    }
                });
                buttons.push(removeAlertButton(id, alert.uuid, s(valorantUser).info.REMOVE_ALERT_BUTTON))
            } else {
                message.embeds.push(await skinEmbed(alert.uuid, skin.price, id, await VPEmoji(id, channel), channel))
                let skinName = l(skin.names, id)
                if (skinName.length > 80) skinName = skinName.slice(0, 76) + " ...";
                buttons.push(removeAlertButton(id, alert.uuid, skinName))
            }
        }
        message.components.push(new ActionRowBuilder().addComponents(buttons.map(i=>i)))
        await channel.send(message).catch(async e => {
            console.error(`Could not send alert message in #${channel.name}! Do I have the right role?`);

            try { // try to log the alert to the console
                const user = await client.users.fetch(id).catch(() => {});
                if(user) console.error(`Please tell ${user.tag} that the skin his want is in their item shop!`); // sorry for that :(
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
            return;
        }

        const user = await client.users.fetch(id).catch(() => {});
        if(user) console.error(`Please tell ${user.tag} that their credentials have expired, and that they should /login again. (I can't find the channel where the alert was set up)`);
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
            description: s(valorantUser).error.AUTH_ERROR_ALERTS_HAPPENED.f({u: id}),
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

export const sendDailyShop = async (id, shop, channelId, valorantUser, tryOnOtherShard=true) => {
    const channel = await fetchChannel(channelId);
    if(!channel) {
        if(client.shard && tryOnOtherShard) {
            sendShardMessage({
                type: "dailyShop",
                id, shop, channelId, valorantUser
            });
            return;
        }

        const user = await client.users.fetch(id).catch(() => {});
        if(user) console.error(`Please tell ${user.tag} that the daily shop is out! (I can't find the channel where the alert was set up)`);
        return;
    }

    const shouldPing = getSetting(id, "pingOnAutoDailyShop");
    const content = shouldPing ? `<@${id}>` : null;

    const rendered = await renderOffers(shop, id, valorantUser, await VPEmoji(id, channel));
    await channel.send({
        content,
        ...rendered
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

export const fetchAlerts = async (interaction) => {
    const auth = await authUser(interaction.user.id);
    if(!auth.success) return authFailureMessage(interaction, auth, s(interaction).error.AUTH_ERROR_ALERTS);

    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    const emojiString = await VPEmoji(interaction, channel);

    return await alertsPageEmbed(interaction, await filteredAlertsForUser(interaction), 0, emojiString);
}
