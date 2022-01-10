import fs from "fs";

import Fuse from "fuse.js";

import {asyncReadJSONFile, fetch} from "./util.js";
import {authUser, deleteUser, getUser, getUserList} from "./auth.js";
import config from "../config.js";

const formatVersion = 2;
let gameVersion = null;

let skins = {};
let prices = {timestamp: null};
let rarities = {};

let searchableSkinList = [];
let fuse;

const getValorantVersion = async () => {
    console.debug("Fetching current Valorant version...");

    const req = await fetch("https://valorant-api.com/v1/version");
    console.assert(req.statusCode === 200, `Valorant version status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant version data status code is ${json.status}!`, json);

    return json.data.manifestId;
}

const loadSkinsJSON = async (filename="skins.json") => {
    const jsonData = await asyncReadJSONFile(filename).catch(() => {});
    if(!jsonData) return;

    gameVersion = jsonData.gameVersion;
    skins = jsonData.skins;
    prices = jsonData.prices;
    rarities = jsonData.rarities;

    return jsonData.formatVersion;
}

const saveSkinsJSON = (filename="skins.json") => {
    fs.writeFileSync(filename, JSON.stringify({formatVersion, gameVersion, skins, prices, rarities}, null, 2));
}

export const refreshSkinList = async (checkVersion=false) => {
    if(checkVersion || !gameVersion) {
        const fileFormatVersion = await loadSkinsJSON();

        const version = await getValorantVersion();
        if(version !== gameVersion || formatVersion !== fileFormatVersion) {
            gameVersion = version;
            await getSkinList(version);
            await getPrices();
            await getRarities();
            saveSkinsJSON();
        } else if(!prices.timestamp || Date.now() - prices.timestamp > 24 * 60 * 60 * 1000) await getPrices();

        formatSearchableSkinList();
    }
}

const getSkinList = async () => {
    console.debug("Fetching Valorant skin list...");

    const req = await fetch("https://valorant-api.com/v1/weapons/skins");
    console.assert(req.statusCode === 200, `Valorant skins status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant skins data status code is ${json.status}!`, json);

    skins = {};
    for(const skin of json.data) {
        const levelOne = skin.levels[0];
        skins[levelOne.uuid] = {
            name: skin.displayName,
            icon: levelOne.displayIcon,
            rarity: skin.contentTierUuid
        }
    }

    saveSkinsJSON();
}

const formatSearchableSkinList = () => {
    searchableSkinList = Object.entries(skins).map(entry => {
        return {uuid: entry[0], ...entry[1]};
    });

    fuse = new Fuse(searchableSkinList, {keys: ['name'], includeScore: true});
}

const getPrices = async (id=null) => {
    if(!config.showSkinPrices) return;

    // if no ID is passed, try with all users
    if(id === null) {
        for(const id of getUserList()) {
            const success = await getPrices(id);
            if(success) return true;
        }
        return false;
    }

    const user = getUser(id);
    if(!user) return;

    const authSuccess = await authUser(id);
    if(!authSuccess) return false;

    console.debug(`Fetching skin prices using ${user.username}'s access token...`);

    const req = await fetch(`https://pd.${user.region}.a.pvp.net/store/v1/offers/`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins prices code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        return false; // user rso is invalid, should we delete the user as well?
    }

    for(const offer of json.Offers) {
        if(offer.OfferID in skins) prices[offer.OfferID] = offer.Cost[Object.keys(offer.Cost)[0]];
    }

    prices.timestamp = Date.now();

    saveSkinsJSON();

    return true;
}

const getRarities = async () => {
    if(!config.showSkinRarities) return false;

    console.debug("Fetching skin rarities list...");

    const req = await fetch("https://valorant-api.com/v1/contenttiers/");
    console.assert(req.statusCode === 200, `Valorant rarities status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant rarities data status code is ${json.status}!`, json);

    rarities = {};
    for(const rarity of json.data) {
        rarities[rarity.uuid] = {
            name: rarity.devName,
            icon: rarity.displayIcon
        }
    }

    saveSkinsJSON();

    return true;
}

export const getSkin = async (uuid, id=null, checkVersion=false) => {
    // only pass the ID if you need the price

    await refreshSkinList(checkVersion);

    let skin = skins[uuid];

    if(id && config.showSkinPrices) {
        if(prices.timestamp === null) await getPrices(id);
        skin.price = prices[uuid];
    }

    const rarity = rarities[skin.rarity] || null;

    return {
        uuid,
        ...skin,
        rarity
    };
}

export const searchSkin = async (query) => {
    await refreshSkinList();
    const results = fuse.search(query).filter(result => result.score < 0.3);
    return await Promise.all(results.map(result => getSkin(result.item.uuid)));
}

export const getShop = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess) return;

    const user = getUser(id);
    console.debug(`Fetching shop for ${user.username}...`);

    const req = await fetch(`https://pd.${user.region}.a.pvp.net/store/v2/storefront/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins offers code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        return deleteUser(id);
    }

    return {
        offers: json.SkinsPanelLayout.SingleItemOffers,
        expires: json.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds
    };
}

export const getBalance = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess) return;

    const user = getUser(id);
    console.debug(`Fetching balance for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetWallet.md
    const req = await fetch(`https://pd.${user.region}.a.pvp.net/store/v1/wallet/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins offers code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") return;

    return {
        vp: json.Balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
        rad: json.Balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"]
    };
}
