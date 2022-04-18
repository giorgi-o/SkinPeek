import {asyncReadJSONFile, fetch, isMaintenance, itemTypes, userRegion} from "../misc/util.js";
import {authUser, getUser, getUserList} from "./auth.js";
import config from "../misc/config.js";
import Fuse from "fuse.js";
import fs from "fs";
import {DEFAULT_VALORANT_LANG, discToValLang} from "../misc/languages.js";

const formatVersion = 5;
let gameVersion;

let skins, rarities, buddies, sprays, cards, titles, bundles;
let prices = {timestamp: null};

let skinSearchers, bundleSearchers;

export const getValorantVersion = async () => {
    console.debug("Fetching current valorant version...");

    const req = await fetch("https://valorant-api.com/v1/version");
    console.assert(req.statusCode === 200, `Valorant version status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant version data status code is ${json.status}!`, json);

    return json.data;
}

export const loadSkinsJSON = async (filename="data/skins.json") => {
    const jsonData = await asyncReadJSONFile(filename).catch(() => {});
    if(!jsonData || jsonData.formatVersion !== formatVersion) return;

    skins = jsonData.skins;
    prices = jsonData.prices;
    rarities = jsonData.rarities;
    bundles = jsonData.bundles;
    buddies = jsonData.buddies;
    sprays = jsonData.sprays;
    cards = jsonData.cards;
    titles = jsonData.titles;
}

export const saveSkinsJSON = (filename="data/skins.json") => {
    fs.writeFileSync(filename, JSON.stringify({formatVersion, gameVersion, skins, prices, bundles, rarities, buddies, sprays, cards, titles}, null, 2));
}

export const fetchData = async (types=null, checkVersion=false) => {
    try {

        if(checkVersion || !gameVersion) gameVersion = (await getValorantVersion()).manifestId;
        await loadSkinsJSON();

        if(types === null) types = [skins, prices, bundles, rarities, buddies, cards, sprays, titles];

        if(types.includes(skins) && (!skins || skins.version !== gameVersion)) await getSkinList(gameVersion);
        if(types.includes(prices) && (!prices || prices.version !== gameVersion)) await getPrices(gameVersion);
        if(types.includes(bundles) && (!bundles || bundles.version !== gameVersion)) await getBundleList(gameVersion);
        if(types.includes(rarities) && (!rarities || rarities.version !== gameVersion)) await getRarities(gameVersion);
        if(types.includes(buddies) && (!buddies || buddies.version !== gameVersion)) await getBuddies(gameVersion);
        if(types.includes(cards) && (!cards || cards.version !== gameVersion)) await getCards(gameVersion);
        if(types.includes(sprays) && (!sprays || sprays.version !== gameVersion)) await getSprays(gameVersion);
        if(types.includes(titles) && (!titles || titles.version !== gameVersion)) await getTitles(gameVersion);

        if(!prices || Date.now() - prices.timestamp > 24 * 60 * 60 * 1000) await getPrices(gameVersion); // refresh prices every 24h

        saveSkinsJSON();
    } catch(e) {
        console.error("There was an error while trying to fetch skin data!");
        console.error(e);
    }
}

export const getSkinList = async (gameVersion) => {
    console.debug("Fetching valorant skin list...");

    const req = await fetch("https://valorant-api.com/v1/weapons/skins?language=all");
    console.assert(req.statusCode === 200, `Valorant skins status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant skins data status code is ${json.status}!`, json);

    skins = {version: gameVersion};
    for(const skin of json.data) {
        const levelOne = skin.levels[0];
        skins[levelOne.uuid] = {
            uuid: levelOne.uuid,
            names: skin.displayName,
            icon: levelOne.displayIcon,
            rarity: skin.contentTierUuid
        }
    }

    saveSkinsJSON();

    formatSearchableSkinList();
}

const formatSearchableSkinList = () => {
    skinSearchers = {};
    for(const locale of new Set(Object.values(discToValLang))) {
        skinSearchers[locale] = new Fuse(Object.values(skins).filter(o => typeof o === "object"), {keys: [`names.${locale}`, `names.${DEFAULT_VALORANT_LANG}`], includeScore: true});
    }
}

const getPrices = async (gameVersion, id=null) => {
    if(!config.fetchSkinPrices) return;

    // if no ID is passed, try with all users
    if(id === null) {
        for(const id of getUserList().sort( // start with the users using cookies to avoid triggering 2FA
            (a, b) => !!getUser(a).cookies - !!getUser(b).cookies)) {
            const success = await getPrices(gameVersion, id);
            if(success) return true;
        }
        return false;
    }

    const user = getUser(id);
    if(!user) return false;

    const authSuccess = await authUser(id);
    if(!authSuccess.success || !user.rso || !user.ent || !user.region) return false;

    console.debug(`Fetching skin prices using ${user.username}'s access token...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetOffers.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/offers/`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins prices code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        return false; // user rso is invalid, should we delete the user as well?
    } else if(isMaintenance(json)) return false;

    prices = {version: gameVersion};
    for(const offer of json.Offers) {
        prices[offer.OfferID] = offer.Cost[Object.keys(offer.Cost)[0]];
    }

    prices.timestamp = Date.now();

    saveSkinsJSON();

    return true;
}

const getBundleList = async (gameVersion) => {
    console.debug("Fetching valorant bundle list...");

    const req = await fetch("https://valorant-api.com/v1/bundles?language=all");
    console.assert(req.statusCode === 200, `Valorant bundles status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant bundles data status code is ${json.status}!`, json);

    bundles = {version: gameVersion};
    for(const bundle of json.data) {
        bundles[bundle.uuid] = {
            uuid: bundle.uuid,
            names: bundle.displayName,
            subNames: bundle.displayNameSubText,
            descriptions: bundle.extraDescription,
            icon: bundle.displayIcon2,
            items: null,
            price: null,
            basePrice: null,
            expires: null
        }
    }

    // get bundle items from https://docs.valtracker.gg/bundles
    const req2 = await fetch("https://api.valtracker.gg/bundles");
    console.assert(req2.statusCode === 200, `ValTracker bundles items status code is ${req.statusCode}!`, req);

    const json2 = JSON.parse(req2.body);
    console.assert(json.status === 200, `ValTracker bundles items data status code is ${json.status}!`, json);

    for(const bundleData of json2.data) {
        if(bundles[bundleData.uuid]) {
            const bundle = bundles[bundleData.uuid];
            const items = [];
            const defaultItemData = {
                amount: 1,
                discount: 0
            }

            for(const weapon of bundleData.weapons)
                items.push({
                    uuid: weapon.levels[0].uuid,
                    type: itemTypes.SKIN,
                    price: weapon.price,
                    ...defaultItemData
                });
            for(const buddy of bundleData.buddies)
                items.push({
                    uuid: buddy.levels[0].uuid,
                    type: itemTypes.BUDDY,
                    price: buddy.price,
                    ...defaultItemData
                });
            for(const card of bundleData.cards)
                items.push({
                    uuid: card.uuid,
                    type: itemTypes.CARD,
                    price: card.price,
                    ...defaultItemData
                });
            for(const spray of bundleData.sprays)
                items.push({
                    uuid: spray.uuid,
                    type: itemTypes.SPRAY,
                    price: spray.price,
                    ...defaultItemData
                });

            bundle.items = items;
            bundle.price = bundleData.price;
        }
    }

    saveSkinsJSON();

    formatSearchableBundleList();
}

export const formatSearchableBundleList = () => {
    bundleSearchers = {};
    for(const locale of new Set(Object.values(discToValLang))) {
        bundleSearchers[locale] = new Fuse(Object.values(bundles).filter(o => typeof o === "object"), {keys: [`names.${locale}`, `names.${DEFAULT_VALORANT_LANG}`], includeScore: true});
    }
}

export const addBundleData = async (bundleData) => {
    await fetchData([bundles]);
    if(bundles[bundleData.uuid]) {
        const bundle = bundles[bundleData.uuid];
        bundle.items = bundleData.items.map(item => {
            return {
                uuid: item.uuid,
                type: item.type,
                price: item.price,
                basePrice: item.basePrice,
                discount: item.discount,
                amount: item.amount
            }
        });
        bundle.price = bundleData.price;
        bundle.basePrice = bundleData.basePrice;
        bundle.expires = bundleData.expires;

        saveSkinsJSON();
    }
}

const getRarities = async (gameVersion) => {
    if(!config.fetchSkinRarities) return false;

    console.debug("Fetching skin rarities list...");

    const req = await fetch("https://valorant-api.com/v1/contenttiers/");
    console.assert(req.statusCode === 200, `Valorant rarities status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant rarities data status code is ${json.status}!`, json);

    rarities = {version: gameVersion};
    for(const rarity of json.data) {
        rarities[rarity.uuid] = {
            uuid: rarity.uuid,
            name: rarity.devName,
            icon: rarity.displayIcon
        }
    }

    saveSkinsJSON();

    return true;
}

export const getBuddies = async (gameVersion) => {
    console.debug("Fetching gun buddies list...");

    const req = await fetch("https://valorant-api.com/v1/buddies?language=all");
    console.assert(req.statusCode === 200, `Valorant buddies status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant buddies data status code is ${json.status}!`, json);

    buddies = {version: gameVersion};
    for(const buddy of json.data) {
        const levelOne = buddy.levels[0];
        buddies[levelOne.uuid] = {
            uuid: levelOne.uuid,
            names: buddy.displayName,
            icon: levelOne.displayIcon
        }
    }

    saveSkinsJSON();
}

export const getCards = async (gameVersion) => {
    console.debug("Fetching player cards list...");

    const req = await fetch("https://valorant-api.com/v1/playercards?language=all");
    console.assert(req.statusCode === 200, `Valorant cards status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant cards data status code is ${json.status}!`, json);

    cards = {version: gameVersion};
    for(const card of json.data) {
        cards[card.uuid] = {
            uuid: card.uuid,
            names: card.displayName,
            icons: {
                small: card.smallArt,
                wide: card.wideArt,
                large: card.largeArt
            }
        }
    }

    saveSkinsJSON();
}

export const getSprays = async (gameVersion) => {
    console.debug("Fetching sprays list...");

    const req = await fetch("https://valorant-api.com/v1/sprays?language=all");
    console.assert(req.statusCode === 200, `Valorant sprays status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant sprays data status code is ${json.status}!`, json);

    sprays = {version: gameVersion};
    for(const spray of json.data) {
        sprays[spray.uuid] = {
            uuid: spray.uuid,
            names: spray.displayName,
            icon: spray.fullTransparentIcon || spray.displayIcon
        }
    }

    saveSkinsJSON();
}

export const getTitles = async (gameVersion) => {
    console.debug("Fetching player titles list...");

    const req = await fetch("https://valorant-api.com/v1/playertitles?language=all");
    console.assert(req.statusCode === 200, `Valorant titles status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant titles data status code is ${json.status}!`, json);

    titles = {version: gameVersion};
    for(const title of json.data) {
        titles[title.uuid] = {
            uuid: title.uuid,
            names: title.displayName,
            text: title.titleText
        }
    }

    saveSkinsJSON();
}

export const getItem = async (uuid, type) =>  {
    switch(type) {
        case itemTypes.SKIN: return await getSkin(uuid);
        case itemTypes.BUDDY: return await getBuddy(uuid);
        case itemTypes.CARD: return await getCard(uuid);
        case itemTypes.SPRAY: return await getSpray(uuid);
        case itemTypes.TITLE: return await getTitle(uuid);
    }
}

export const getSkin = async (uuid) => {
    await fetchData([skins]);

    let skin = skins[uuid];
    if(!skin) return null;

    skin.price = await getPrice(uuid);
    skin.rarity = await getRarity(skin.rarity);

    return skin;
}

export const getPrice = async (uuid) => {
    if(!prices) await fetchData([prices]);
    return prices[uuid] || null;
}

const getRarity = async (uuid) => {
    if(!rarities) await fetchData([rarities]);
    if(rarities) return rarities[uuid] || null;
}

export const searchSkin = async (query, locale) => {
    await fetchData([skins]);

    if(!skinSearchers) formatSearchableSkinList();
    const results = skinSearchers[discToValLang[locale] || DEFAULT_VALORANT_LANG].search(query).filter(result => result.score < 0.3);

    return await Promise.all(results.map(result => getSkin(result.item.uuid)));
}

export const getBundle = async (uuid) => {
    await fetchData([bundles]);
    return bundles[uuid];
}

export const searchBundle = async (query, locale) => {
    await fetchData([bundles]);

    if(!bundleSearchers) formatSearchableBundleList();
    const results = bundleSearchers[discToValLang[locale] || DEFAULT_VALORANT_LANG].search(query).filter(result => result.score < 0.3);

    return await Promise.all(results.map(result => getBundle(result.item.uuid)));
}

export const getBuddy = async (uuid) => {
    if(!buddies) await fetchData([buddies]);
    return buddies[uuid];
}

export const getSpray = async (uuid) => {
    if(!sprays) await fetchData([sprays]);
    return sprays[uuid];
}

export const getCard = async (uuid) => {
    if(!cards) await fetchData([cards]);
    return cards[uuid];
}

export const getTitle = async (uuid) => {
    if(!titles) await fetchData([titles]);
    return titles[uuid];
}
