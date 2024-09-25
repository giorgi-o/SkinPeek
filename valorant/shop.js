import fs from "fs";
import { authUser, deleteUserAuth, getUser } from "./auth.js";
import {
    discordTag,
    fetch,
    formatBundle,
    formatNightMarket,
    getPuuid,
    isMaintenance, isSameDay,
    userRegion,
    riotClientHeaders,
} from "../misc/util.js";
import { addBundleData, getSkin, getSkinFromSkinUuid } from "./cache.js";
import { addStore } from "../misc/stats.js";
import config from "../misc/config.js";
import { deleteUser, saveUser } from "./accountSwitcher.js";
import { mqGetShop, useMultiqueue } from "../misc/multiqueue.js";

export const getShop = async (id, account = null) => {
    if (useMultiqueue()) return await mqGetShop(id, account);

    const authSuccess = await authUser(id, account);
    if (!authSuccess.success) return authSuccess;

    const user = getUser(id, account);
    console.log(`Fetching shop for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetStorefrontV2.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v3/storefront/${user.puuid}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        },
        body: JSON.stringify({})
    });
    console.assert(req.statusCode === 200, `Valorant skins offers code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false }
    } else if (isMaintenance(json)) return { success: false, maintenance: true };

    // shop stats tracking
    try {
        addStore(user.puuid, json.SkinsPanelLayout.SingleItemOffers);
    } catch (e) {
        console.error("Error adding shop stats!");
        console.error(e);
        console.error(json);
    }

    // add to shop cache
    addShopCache(user.puuid, json);

    // save bundle data & prices
    Promise.all(json.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle))).then(async bundles => {
        for (const bundle of bundles)
            await addBundleData(bundle);
    });

    return { success: true, shop: json };
}

export const getOffers = async (id, account = null) => {
    const shopCache = getShopCache(getPuuid(id, account), "offers");
    if (shopCache) return { success: true, cached: true, ...shopCache.offers };

    const resp = await getShop(id, account);
    if (!resp.success) return resp;

    return await easterEggOffers(id, account, {
        success: true,
        offers: resp.shop.SkinsPanelLayout.SingleItemOffers,
        expires: Math.floor(Date.now() / 1000) + resp.shop.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds,
        accessory: {
            offers: (resp.shop.AccessoryStore.AccessoryStoreOffers || []).map(rawAccessory => {
                return {
                    cost: rawAccessory.Offer.Cost["85ca954a-41f2-ce94-9b45-8ca3dd39a00d"],
                    rewards: rawAccessory.Offer.Rewards,
                    contractID: rawAccessory.ContractID
                }
            }),
            expires: Math.floor(Date.now() / 1000) + resp.shop.AccessoryStore.AccessoryStoreRemainingDurationInSeconds
        }
    });
}

export const getBundles = async (id, account = null) => {
    const shopCache = getShopCache(getPuuid(id, account), "bundles");
    if (shopCache) return { success: true, bundles: shopCache.bundles };

    const resp = await getShop(id, account);
    if (!resp.success) return resp;

    const formatted = await Promise.all(resp.shop.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle)));

    return { success: true, bundles: formatted };
}

export const getNightMarket = async (id, account = null) => {
    const shopCache = getShopCache(getPuuid(id, account), "night_market");
    if (shopCache) return { success: true, ...shopCache.night_market };

    const resp = await getShop(id, account);
    if (!resp.success) return resp;

    if (!resp.shop.BonusStore) return {
        success: true,
        offers: false
    }

    return { success: true, ...formatNightMarket(resp.shop.BonusStore) };
}

export const getBalance = async (id, account = null) => {
    const authSuccess = await authUser(id, account);
    if (!authSuccess.success) return authSuccess;

    const user = getUser(id, account);
    console.log(`Fetching balance for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetWallet.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/wallet/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        }
    });
    console.assert(req.statusCode === 200, `Valorant balance code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUser(id, account);
        return { success: false };
    } else if (isMaintenance(json)) return { success: false, maintenance: true };

    return {
        success: true,
        vp: json.Balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
        rad: json.Balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"],
        kc: json.Balances["85ca954a-41f2-ce94-9b45-8ca3dd39a00d"]
    };
}

let nextNMTimestamp = null, nextNMTimestampUpdated = 0;
export const getNextNightMarketTimestamp = async () => {
    // only fetch every 5 minutes
    if (nextNMTimestampUpdated > Date.now() - 5 * 60 * 1000) return nextNMTimestamp;

    // thx Mistral for maintaining this!
    const req = await fetch("https://gist.githubusercontent.com/mistralwz/17bb10db4bb77df5530024bcb0385042/raw/nmdate.txt");

    const [timestamp] = req.body.split("\n");
    nextNMTimestamp = parseInt(timestamp);
    if (isNaN(nextNMTimestamp) || nextNMTimestamp < Date.now() / 1000) nextNMTimestamp = null;

    nextNMTimestampUpdated = Date.now();
    return nextNMTimestamp;
}

export let NMTimestamp = null;
/** Shop cache format:
 * {
 *     offers: {
 *         offers: [...],
 *         expires: timestamp,
 *         accessory: {
 *              offers: [{
 *                  "cost": 4000,
 *                  "rewards": [{
 *                      "ItemTypeID": uuid,
 *                      "ItemID": uuid,
 *                      "Quantity": number
 *                      }],
 *                  "contractID": uuid
 *                  },...],
 *              expires: timestamp
 *          }
 *     },
 *     bundles: [{
 *         uuid: uuid,
 *         expires: timestamp
 *     }, {...}],
 *     night_market?: {
 *         offers: [{
 *             uuid: uuid,
 *             realPrice: 5000,
 *             nmPrice: 1000,
 *             percent: 80
 *         }, {...}],
 *         expires: timestamp
 *     },
 *     timestamp: timestamp
 * }
 */

export const getShopCache = (puuid, target = "offers", print = true) => {
    if (!config.useShopCache) return null;

    try {
        const shopCache = JSON.parse(fs.readFileSync("data/shopCache/" + puuid + ".json", "utf8"));

        let expiresTimestamp;
        if (target === "offers") expiresTimestamp = shopCache[target].expires;
        else if (target === "night_market") expiresTimestamp = shopCache[target] ? shopCache[target].expires : getMidnightTimestamp(shopCache.timestamp);
        else if (target === "bundles") expiresTimestamp = Math.min(...shopCache.bundles.map(bundle => bundle.expires), get9PMTimetstamp(Date.now()));
        else if (target === "all") expiresTimestamp = Math.min(shopCache.offers.expires, ...shopCache.bundles.map(bundle => bundle.expires), get9PMTimetstamp(Date.now()), shopCache.night_market.expires);
        else console.error("Invalid target for shop cache! " + target);

        if (Date.now() / 1000 > expiresTimestamp) return null;

        if (print) console.log(`Fetched shop cache for user ${discordTag(puuid)}`);

        if (!shopCache.offers.accessory) return null;// If there are no accessories in the cache, it returns null so that the user's shop is checked again.

        return shopCache;
    } catch (e) { }
    return null;
}

const addShopCache = (puuid, shopJson) => {
    if (!config.useShopCache) return;

    const now = Date.now();
    const shopCache = {
        offers: {
            offers: shopJson.SkinsPanelLayout.SingleItemOffers,
            expires: Math.floor(now / 1000) + shopJson.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds,
            accessory: {
                offers: (shopJson.AccessoryStore.AccessoryStoreOffers || []).map(rawAccessory => {
                    return {
                        cost: rawAccessory.Offer.Cost["85ca954a-41f2-ce94-9b45-8ca3dd39a00d"],
                        rewards: rawAccessory.Offer.Rewards,
                        contractID: rawAccessory.ContractID
                    }
                }),
                expires: Math.floor(now / 1000) + shopJson.AccessoryStore.AccessoryStoreRemainingDurationInSeconds
            }
        },
        bundles: shopJson.FeaturedBundle.Bundles.map(rawBundle => {
            return {
                uuid: rawBundle.DataAssetID,
                expires: Math.floor(now / 1000) + rawBundle.DurationRemainingInSeconds,
            }
        }),
        night_market: formatNightMarket(shopJson.BonusStore),
        timestamp: now
    }

    if (shopJson.BonusStore) NMTimestamp = now

    if (!fs.existsSync("data/shopCache")) fs.mkdirSync("data/shopCache");
    fs.writeFileSync("data/shopCache/" + puuid + ".json", JSON.stringify(shopCache, null, 2));

    console.log(`Added shop cache for user ${discordTag(puuid)}`);
}

const getMidnightTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999) / 1000;
}

const get9PMTimetstamp = (timestamp) => { // new bundles appear at 9PM UTC
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 20, 59, 59, 999) / 1000;
}


const easterEggOffers = async (id, account, offers) => {
    // shhh...
    try {
        const _offers = { ...offers, offers: [...offers.offers] };
        const user = getUser(id, account);

        const sawEasterEgg = isSameDay(user.lastSawEasterEgg, Date.now());
        const isApril1st = new Date().getMonth() === 3 && new Date().getDate() === 1;
        if (isApril1st && !sawEasterEgg) {

            for (const [i, uuid] of Object.entries(_offers.offers)) {
                const skin = await getSkin(uuid);
                const defaultSkin = await getSkinFromSkinUuid(skin.defaultSkinUuid);
                _offers.offers[i] = defaultSkin.uuid;
            }

            user.lastSawEasterEgg = Date.now();
            saveUser(user);
            return _offers
        }
    } catch (e) {
        console.error(e);
    }
    return offers;
}
