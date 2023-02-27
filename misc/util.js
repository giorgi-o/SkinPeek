import {rarityEmoji} from "../discord/emoji.js";
import {ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField} from "discord.js";
import {getItem, getRarity} from "../valorant/cache.js";

import https from "https";
import http from "http";
import fs from "fs";
import {DEFAULT_LANG, l, valToDiscLang} from "./languages.js";
import {client} from "../discord/bot.js";
import {getUser} from "../valorant/auth.js";
import config from "./config.js";

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
    if(config.logUrls) console.log("Fetching url " + url.substring(0, 200) + (url.length > 200 ? "..." : ""));
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
            minVersion: "TLSv1.3",
            agent: options.agent,
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

const ProxyType = {
    HTTPS: "https",
    // SOCKS4: "socks4", // not supported yet
    // SOCKS5: "socks5", // not supported yet
}

class Proxy {
    constructor({manager, type, host, port, username, password}) {
        this.manager = manager;
        this.type = type || ProxyType.HTTPS;
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;

        this.agents = {
            "example.com": null
        };
        this.publicIp = null;
    }

    createAgent(hostname) {
        if(this.type !== ProxyType.HTTPS) throw new Error("Unsupported proxy type " + this.type);

        return new Promise((resolve, reject) => {
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
            };
            if(this.username && this.password) {
                headers["Proxy-Authorization"] = "Basic " + Buffer.from(this.username + ":" + this.password).toString("base64");
            }

            const req = http.request({
                host: this.host,
                port: this.port,
                method: "CONNECT",
                path: hostname + ":443",
                headers: headers,
                timeout: 1,
            });
            console.log(`Sent proxy connection request to ${this.host}:${this.port} for ${hostname}`);

            req.on("connect", (res, socket) => {
                console.log(`Proxy ${this.host}:${this.port} connected to ${hostname}!`);
                if (res.statusCode !== 200) {
                    reject(`Proxy ${this.host}:${this.port} returned status code ${res.statusCode}!`);
                }

                socket.on("error", err => {
                    console.error(`Proxy ${this.host}:${this.port} errored: ${err}`);
                    if(this.agents[hostname] === agent) delete this.agents[hostname];
                    this.manager.proxyIsDead(this);
                });

                const agent = new https.Agent({
                    socket,
                    keepAlive: true,
                });
                this.agents[hostname] = agent;
                resolve(agent);
            });

            req.on("error", err => {
                reject(`Proxy ${this.host}:${this.port} errored: ${err}`);
            });

            req.end();
        });
    }

    async getAgent(hostname) {
        return this.agents[hostname] || await this.createAgent(hostname);
    }

    async test() {
        const agent = await this.getAgent("api.ipify.org");
        const res = await fetch("https://api.ipify.org", {agent});

        if(res.statusCode !== 200) {
            console.error(`Proxy ${this.host}:${this.port} returned status code ${res.statusCode}!`);
            return false;
        }

        const ip = res.body.trim();
        if(!ip) {
            console.error(`Proxy ${this.host}:${this.port} returned no IP!`);
            return false;
        }

        this.publicIp = ip;
        return true;
    }
}

class ProxyManager {
    constructor() {
        this.allProxies = [];

        this.activeProxies = {
            "example.com": []
        };
        this.deadProxies = [];

        this.enabled = false;
    }

    async loadProxies() {
        const proxyFile = await asyncReadFile("data/proxies.txt").catch(_ => {});
        if(!proxyFile) return;

        let type = ProxyType.HTTPS;
        let username = null;
        let password = null;

        // for each line in proxies.txt
        for(const line of proxyFile.toString().split("\n")) {
            const trimmed = line.trim();
            if(!trimmed.length || trimmed.startsWith("#")) continue;

            // split by colons
            const parts = trimmed.split(":");
            if(parts.length < 2) continue;

            // first part is the proxy host
            const host = parts[0];
            if(!host.length) continue;

            // second part is the proxy port
            const port = parseInt(parts[1]);
            if(isNaN(port)) continue;

            // third part is the proxy type
            type = parts[2]?.toLowerCase() || ProxyType.HTTPS;
            if(type !== ProxyType.HTTPS) {
                console.error(`Unsupported proxy type ${type}!`);
                type = ProxyType.HTTPS;
                continue;
            }

            // fourth part is the proxy username
            username = parts[3] || null;

            // fifth part is the proxy password
            password = parts[4] || null;

            // create the proxy object
            const proxy = new Proxy({
                type, host, port, username, password,
                manager: this
            });

            // add it to the list of all proxies
            this.allProxies.push(proxy);
        }

        this.enabled = this.allProxies.length > 0;
    }

    async loadForHostname(hostname) {
        if(!this.enabled) return;

        // called both to load the initial set of proxies for a hostname,
        // and to repopulate the list if the current set has an invalid one

        const activeProxies = this.activeProxies[hostname] || [];
        const promises = [];

        const proxyFailed = async proxy => {
            this.deadProxies.push(proxy);
        }

        for(const proxy of this.allProxies) {
            if(!this.allProxies.length) break;
            if(activeProxies.length >= config.maxActiveProxies) break;
            if(activeProxies.includes(proxy)) continue;
            if(this.deadProxies.includes(proxy)) continue;

            /*try {
                const proxyWorks = await proxy.test();
                if(!proxyWorks) {
                    this.deadProxies.push(proxy);
                    continue;
                }

                await proxy.createAgent(hostname);
                activeProxies.push(proxy);
            } catch(err) {
                console.error(err);
                this.deadProxies.push(proxy);
            }*/

            let timedOut = false;
            const promise = proxy.test().then(proxyWorks => {
                if(!proxyWorks) return Promise.reject(`Proxy ${proxy.host}:${proxy.port} failed!`);
                if(timedOut) return Promise.reject();

                return proxy.createAgent(hostname);
            }).then((/*agent*/) => {
                if(timedOut) return Promise.reject();

                activeProxies.push(proxy);
            }).catch(err => {
                if(err) console.error(err);
                this.deadProxies.push(proxy);
            });

            const promiseWithTimeout = promiseTimeout(promise, 5000).then(res => {
                if(res === null) {
                    timedOut = true;
                    console.error(`Proxy ${proxy.host}:${proxy.port} timed out!`);
                }
            });
            promises.push(promiseWithTimeout);
        }

        await Promise.all(promises);

        if(!activeProxies.length) {
            console.error(`No working proxies found!`);
            return;
        }

        // console.log(`Loaded ${activeProxies.length} proxies for ${hostname}`);
        this.activeProxies[hostname] = activeProxies;

        return activeProxies;
    }

    async getAgent(hostname) {
        if(!this.enabled) return null;

        const activeProxies = await this.loadForHostname(hostname);
        if(!activeProxies?.length) return null;

        let proxy;
        do {
            proxy = activeProxies.shift();
        } while(this.deadProxies.includes(proxy));
        if(!proxy) return null;

        activeProxies.push(proxy);
        return proxy.getAgent(hostname);
    }

    async getAgentForUrl(url) {
        const hostname = new URL(url).hostname;
        return this.getAgent(hostname);
    }

    async proxyIsDead(proxy) {
        this.deadProxies.push(proxy);
        await this.loadForHostname(proxy.hostname);
    }

    async fetch(url, options = {}) {
        if(!this.enabled) return await fetch(url, options);

        const agent = await this.getAgentForUrl(url);

    }
}

const proxyManager = new ProxyManager();
export const initProxyManager = async () => await proxyManager.loadProxies();
export const getProxyManager = () => proxyManager;

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
    const match = uri.match(/access_token=((?:[a-zA-Z]|\d|\.|-|_)*).*id_token=((?:[a-zA-Z]|\d|\.|-|_)*).*expires_in=(\d*)/);
    if(!match) return [null, null];

    const [, accessToken, idToken] = match;
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

export const skinNameAndEmoji = async (skin, channel, localeOrInteraction=DEFAULT_LANG) => {
    const name = l(skin.names, localeOrInteraction);
    if(!skin.rarity) return name;

    const rarity = await getRarity(skin.rarity, channel);
    if(!rarity) return name;

    const rarityIcon = await rarityEmoji(channel, rarity.name, rarity.icon);
    return rarityIcon ? `${rarityIcon} ${name}` : name;
}

export const actionRow = (button) => new ActionRowBuilder().addComponents(button);

export const removeAlertButton = (id, uuid, buttonText) => new ButtonBuilder().setCustomId(`removealert/${uuid}/${id}/${Math.round(Math.random() * 100000)}`).setStyle(ButtonStyle.Danger).setLabel(buttonText).setEmoji("✖");
export const removeAlertActionRow = (id, uuid, buttonText) => new ActionRowBuilder().addComponents(removeAlertButton(id, uuid, buttonText));

export const retryAuthButton = (id, operationId, buttonText) => new ButtonBuilder().setCustomId(`retry_auth/${operationId}`).setStyle(ButtonStyle.Danger).setLabel(buttonText).setEmoji("🔄");

export const externalEmojisAllowed = (channel) => !channel || !channel.guild || channel.permissionsFor(channel.guild.roles.everyone).has(PermissionsBitField.Flags.UseExternalEmojis);
export const canCreateEmojis = (guild) => guild && guild.members.me && guild.members.me.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers);
export const emojiToString = (emoji) => emoji && `<:${emoji.name}:${emoji.id}>`;

export const canSendMessages = (channel) => {
    if(!channel || !channel.guild) return true;
    const permissions = channel.permissionsFor(channel.guild.members.me);
    return permissions.has(PermissionsBitField.Flags.ViewChannel) && permissions.has(PermissionsBitField.Flags.SendMessages) && permissions.has(PermissionsBitField.Flags.EmbedLinks);
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

// misc utils

export const wait = ms => new Promise(r => setTimeout(r, ms));

export const promiseTimeout = async (promise, ms, valueIfTimeout=null) => {
    return await Promise.race([promise, wait(ms).then(() => valueIfTimeout)]);
}

export const isToday = (timestamp) => isSameDay(timestamp, Date.now());
export const isSameDay = (t1, t2) => {
    t1 = new Date(t1); t2 = new Date(t2);
    return t1.getUTCFullYear() === t2.getUTCFullYear() && t1.getUTCMonth() === t2.getUTCMonth() && t1.getUTCDate() === t2.getUTCDate();
}

export const ensureUsersFolder = () => {
    if(!fs.existsSync("data")) fs.mkdirSync("data");
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");
}

export const findKeyOfValue = (obj, value) => Object.keys(obj).find(key => obj[key] === value);
