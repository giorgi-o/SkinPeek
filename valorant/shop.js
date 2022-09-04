import fs from "fs";
import {authUser, deleteUserAuth, getUser} from "./auth.js";
import {
    discordTag,
    fetch,
    formatBundle,
    formatNightMarket,
    getPuuid,
    isMaintenance,
    userRegion
} from "../misc/util.js";
import {addBundleData} from "./cache.js";
import {addStore} from "../misc/stats.js";
import config from "../misc/config.js";
import {deleteUser} from "./accountSwitcher.js";

const getShop = async (id, account=null) => {
    const authSuccess = await authUser(id, account);
    if(!authSuccess.success) return authSuccess;

    const user = getUser(id, account);
    console.log(`Fetching shop for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetStorefrontV2.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v2/storefront/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins offers code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return {success: false}
    } else if(isMaintenance(json)) return {success: false, maintenance: true};

    // shop stats tracking
    try {
        addStore(user.puuid, json.SkinsPanelLayout.SingleItemOffers);
    } catch(e) {
        console.error("Error adding shop stats!");
        console.error(e);
        console.error(json);
    }

    // add to shop cache
    addShopCache(user.puuid, json);

    // save bundle data & prices
    Promise.all(json.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle))).then(async bundles => {
        for(const bundle of bundles)
            await addBundleData(bundle);
    });

    return {success: true, shop: json};
}

export const getOffers = async (id, account=null) => {
    const shopCache = getShopCache(getPuuid(id, account), "offers");
    if(shopCache) return {success: true, cached: true, ...shopCache.offers};

    const resp = await getShop(id, account);
    if(!resp.success) return resp;

    return {
        success: true,
        offers: resp.shop.SkinsPanelLayout.SingleItemOffers,
        expires: Math.floor(Date.now() / 1000) + resp.shop.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds
    };
}

export const getBundles = async (id, account=null) => {
    const shopCache = getShopCache(getPuuid(id, account), "bundles");
    if(shopCache) return {success: true, bundles: shopCache.bundles};

    const resp = await getShop(id, account);
    if(!resp.success) return resp;

    const formatted = await Promise.all(resp.shop.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle)));

    return {success: true, bundles: formatted};
}

export const getNightMarket = async (id, account=null) => {
    const shopCache = getShopCache(getPuuid(id, account), "night_market");
    if(shopCache) return {success: true, ...shopCache.night_market};

    const resp = await getShop(id, account);
    if(!resp.success) return resp;

    if(!resp.shop.BonusStore) return {
        success: true,
        offers: false
    }

    return {success: true, ...formatNightMarket(resp.shop.BonusStore)};
}

export const getBalance = async (id, account=null) => {
    const authSuccess = await authUser(id, account);
    if(!authSuccess.success) return authSuccess;

    const user = getUser(id, account);
    console.log(`Fetching balance for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetWallet.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/wallet/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant balance code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUser(id, account);
        return {success: false};
    } else if(isMaintenance(json)) return {success: false, maintenance: true};

    return {
        success: true,
        vp: json.Balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
        rad: json.Balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"]
    };
}

/** Shop cache format:
 * {
 *     offers: {
 *         offers: [...],
 *         expires: timestamp
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

export const getShopCache = (puuid, target="offers", print=true) => {
    if(!config.useShopCache) return null;

    try {
        const shopCache = JSON.parse(fs.readFileSync("data/shopCache/" + puuid + ".json", "utf8"));

        let expiresTimestamp;
        if(target === "offers") expiresTimestamp = shopCache[target].expires;
        else if(target === "night_market") expiresTimestamp = shopCache[target] ? shopCache[target].expires : getMidnightTimestamp(shopCache.timestamp);
        else if(target === "bundles") expiresTimestamp = Math.min(...shopCache.bundles.map(bundle => bundle.expires), get9PMTimetstamp(Date.now()));
        else if(target === "all") expiresTimestamp = Math.min(shopCache.offers.expires, ...shopCache.bundles.map(bundle => bundle.expires), get9PMTimetstamp(Date.now()), shopCache.night_market.expires);
        else console.error("Invalid target for shop cache! " + target);

        if(Date.now() / 1000 > expiresTimestamp) return null;

        if(print) console.log(`Fetched shop cache for user ${discordTag(puuid)}`);
        return shopCache;
    } catch(e) {}
    return null;
}

const addShopCache = (puuid, shopJson) => {
    if(!config.useShopCache) return;

    const now = Date.now();
    const shopCache = {
        offers: {
            offers: shopJson.SkinsPanelLayout.SingleItemOffers,
            expires: Math.floor(now / 1000) + shopJson.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds
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

    if(!fs.existsSync("data/shopCache")) fs.mkdirSync("data/shopCache");
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
