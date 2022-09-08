import {rarityEmoji} from "../discord/emoji.js";
import {MessageActionRow, MessageButton, Permissions, Util} from "discord.js";
import {getItem, getRarity} from "../valorant/cache.js";

import https from "https";
import fs from "fs";
import {DEFAULT_LANG, l, valToDiscLang} from "./languages.js";
import {client} from "../discord/bot.js";
import {getUser} from "../valorant/auth.js";

const tlsCiphers = [
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-SHA256',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-AES128-SHA',
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-ECDSA-AES256-SHA',
    'ECDHE-RSA-AES256-SHA',
    'RSA-PSK-AES128-GCM-SHA256',
    'RSA-PSK-AES256-GCM-SHA384',
    'RSA-PSK-AES128-CBC-SHA',
    'RSA-PSK-AES256-CBC-SHA',
];

const tlsSigAlgs = [
    'ecdsa_secp256r1_sha256',
    'rsa_pss_rsae_sha256',
    'rsa_pkcs1_sha256',
    'ecdsa_secp384r1_sha384',
    'rsa_pss_rsae_sha384',
    'rsa_pkcs1_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha512',
    'rsa_pkcs1_sha1',
]

// all my homies hate node-fetch
export const fetch = (url, options={}) => {
    // console.log("Fetching url " + url);
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: options.method || "GET",
            headers: {
                cookie: "dummy=cookie", // set dummy cookie, helps with cloudflare 1020
                "Accept-Language": "en-US,en;q=0.5", // same as above
                ...options.headers
            },
            ciphers: tlsCiphers.join(':'),
            sigalgs: tlsSigAlgs.join(':'),
            minVersion: "TLSv1.3"
        }, resp => {
            const res = {
                statusCode: resp.statusCode,
                headers: resp.headers
            };
            let chunks = [];
            resp.on('data', (chunk) => chunks.push(chunk));
            resp.on('end', () => {
                res.body = Buffer.concat(chunks).toString(options.encoding || "utf8");
                resolve(res);
            });
            resp.on('error', err => {
                console.error(err);
                reject(err);
            });
        });
        req.write(options.body || "");
        req.end();
        req.on('error', err => {
            console.error(err);
            reject(err);
        });
    });
}

// file utils

export const asyncReadFile = (path) => {
    return new Promise(((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if(err) reject(err);
            else resolve(data);
        })
    }));
}

export const asyncReadJSONFile = async (path) => {
    return JSON.parse((await asyncReadFile(path)).toString());
}

// riot utils

export const itemTypes = {
    SKIN: "e7c63390-eda7-46e0-bb7a-a6abdacd2433",
    BUDDY: "dd3bf334-87f3-40bd-b043-682a57a8dc3a",
    SPRAY: "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475",
    CARD: "3f296c07-64c3-494c-923b-fe692a4fa1bd",
    TITLE: "de7caa6b-adf7-4588-bbd1-143831e786c6"
}

export const parseSetCookie = (setCookie) => {
    if(!setCookie) {
        console.error("Riot didn't return any cookies during the auth request! Cloudflare might have something to do with it...");
        return {};
    }

    const cookies = {};
    for(const cookie of setCookie) {
        const sep = cookie.indexOf("=");
        cookies[cookie.slice(0, sep)] = cookie.slice(sep + 1, cookie.indexOf(';'));
    }
    return cookies;
}

export const stringifyCookies = (cookies) => {
    const cookieList = [];
    for (let [key, value] of Object.entries(cookies)) {
        cookieList.push(key + "=" + value);
    }
    return cookieList.join("; ");
}

export const extractTokensFromUri = (uri) => {
    // thx hamper for regex
    const [, accessToken, idToken] = uri.match(/access_token=((?:[a-zA-Z]|\d|\.|-|_)*).*id_token=((?:[a-zA-Z]|\d|\.|-|_)*).*expires_in=(\d*)/);
    return [accessToken, idToken]
}

export const decodeToken = (token) => {
    const encodedPayload = token.split('.')[1];
    return JSON.parse(atob(encodedPayload));
}

export const tokenExpiry = (token) => {
    return decodeToken(token).exp * 1000;
}

export const userRegion = ({region}) => {
    if(!region || region === "latam" || region === "br") return "na";
    return region;
}

export const isMaintenance = (json) => {
    return json.httpStatus === 403 && json.errorCode === "SCHEDULED_DOWNTIME";
}

export const formatBundle = async (rawBundle) => {
    const bundle = {
        uuid: rawBundle.DataAssetID,
        expires: Math.floor(Date.now() / 1000) + rawBundle.DurationRemainingInSeconds,
        items: []
    }

    let price = 0;
    let basePrice = 0;
    for(const rawItem of rawBundle.Items) {
        const item = {
            uuid: rawItem.Item.ItemID,
            type: rawItem.Item.ItemTypeID,
            item: await getItem(rawItem.Item.ItemID, rawItem.Item.ItemTypeID),
            amount: rawItem.Item.Amount,
            price: rawItem.DiscountedPrice,
            basePrice: rawItem.BasePrice,
            discount: rawItem.DiscountPercent
        }

        price += item.price;
        basePrice += item.basePrice;

        bundle.items.push(item);
    }

    bundle.price = price;
    bundle.basePrice = basePrice;

    return bundle;
}

export const fetchMaintenances = async (region) => {
    const req = await fetch(`https://valorant.secure.dyn.riotcdn.net/channels/public/x/status/${region}.json`);
    return JSON.parse(req.body);
}

export const formatNightMarket = (rawNightMarket) => {
    if(!rawNightMarket) return null;

    return {
        offers: rawNightMarket.BonusStoreOffers.map(offer => {return {
            uuid: offer.Offer.OfferID,
            realPrice: offer.Offer.Cost["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
            nmPrice: offer.DiscountCosts["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
            percent: offer.DiscountPercent
        }}),
        expires: Math.floor(Date.now() / 1000) + rawNightMarket.BonusStoreRemainingDurationInSeconds
    }
}

export const removeDupeAlerts = (alerts) => {
    const uuids = [];
    return alerts.filter(alert => {
        if(uuids.includes(alert.uuid)) return false;
        return uuids.push(alert.uuid);
    });
}

export const getPuuid = (id, account=null) => {
    return getUser(id, account).puuid;
}

// discord utils

export const defer = async (interaction, ephemeral=false) => {
    // discord only sets deferred to true once the event is sent over ws, which doesn't happen immediately
    await interaction.deferReply({ephemeral});
    interaction.deferred = true;
}

export const skinNameAndEmoji = async (skin, channel, locale=DEFAULT_LANG) => {
    const name = l(skin.names, locale);
    if(!skin.rarity) return name;

    const rarity = await getRarity(skin.rarity, channel);
    if(!rarity) return name;

    const rarityIcon = await rarityEmoji(channel, rarity.name, rarity.icon);
    return rarityIcon ? `${rarityIcon} ${name}` : name;
}

export const actionRow = (button) => new MessageActionRow().addComponents(button);

export const removeAlertButton = (id, uuid, buttonText) => new MessageButton().setCustomId(`removealert/${uuid}/${id}/${Math.round(Math.random() * 100000)}`).setStyle("DANGER").setLabel(buttonText).setEmoji("✖");
export const removeAlertActionRow = (id, uuid, buttonText) => new MessageActionRow().addComponents(removeAlertButton(id, uuid, buttonText));

export const retryAuthButton = (id, operationId, buttonText) => new MessageButton().setCustomId(`retry_auth/${operationId}`).setStyle("PRIMARY").setLabel(buttonText).setEmoji("🔄");

export const externalEmojisAllowed = (channel) => !channel || !channel.guild || channel.permissionsFor(channel.guild.roles.everyone).has(Permissions.FLAGS.USE_EXTERNAL_EMOJIS);
export const canCreateEmojis = (guild) => guild && guild.me && guild.me.permissions.has(Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS);
export const emojiToString = (emoji) => emoji && `<:${emoji.name}:${emoji.id}>`;

export const canSendMessages = (channel) => {
    if(!channel || !channel.guild) return true;
    const permissions = channel.permissionsFor(channel.guild.me);
    return permissions.has(Permissions.FLAGS.VIEW_CHANNEL) && permissions.has(Permissions.FLAGS.SEND_MESSAGES) && permissions.has(Permissions.FLAGS.EMBED_LINKS);
}

export const fetchChannel = async (channelId) => {
    try {
        return await client.channels.fetch(channelId);
    } catch(e) {
        return null;
    }
}

export const getChannelGuildId = async (channelId) => {
    if(client.shard) {
        const f = client => {
            const channel = client.channels.get(channelId);
            if(channel) return channel.guildId;
        };
        const results = await client.shard.broadcastEval(f);
        return results.find(result => result);
    } else {
        const channel = client.channels.cache.get(channelId);
        return channel && channel.guildId;
    }
}

export const valNamesToDiscordNames = (names) => {
    const obj = {};
    for(const [valLang, name] of Object.entries(names)) {
        if(valToDiscLang[valLang]) obj[valToDiscLang[valLang]] = name;
    }
    return obj;
}

export const canEditInteraction = (interaction) => Date.now() - interaction.createdTimestamp < 14.8 * 60 * 1000;

export const discordTag = id => {
    const user = client.users.cache.get(id);
    return user ? `${user.username}#${user.discriminator}` : id;
}

export const escapeMarkdown = Util.escapeMarkdown;

// misc utils

export const wait = ms => new Promise(r => setTimeout(r, ms));

export const isToday = (timestamp) => isSameDay(timestamp, Date.now());
export const isSameDay = (t1, t2) => {
    t1 = new Date(t1); t2 = new Date(t2);
    return t1.getUTCFullYear() === t2.getUTCFullYear() && t1.getUTCMonth() === t2.getUTCMonth() && t1.getUTCDate() === t2.getUTCDate();
}

export const ensureUsersFolder = () => {
    if(!fs.existsSync("data")) fs.mkdirSync("data");
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");
}
