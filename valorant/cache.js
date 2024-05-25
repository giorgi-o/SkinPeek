import { asyncReadJSONFile, fetch, isMaintenance, itemTypes, userRegion } from "../misc/util.js";
import { authUser, getUser, getUserList } from "./auth.js";
import config from "../misc/config.js";
import fuzzysort from "fuzzysort";
import fs from "fs";
import { DEFAULT_VALORANT_LANG, discToValLang } from "../misc/languages.js";
import { client } from "../discord/bot.js";
import { sendShardMessage } from "../misc/shardMessage.js";
import { riotClientHeaders } from "../misc/util.js";

const formatVersion = 14;
let gameVersion;

let weapons, skins, rarities, buddies, sprays, cards, titles, bundles, battlepass;
let prices = { timestamp: null };

export const clearCache = () => {
    weapons = skins = rarities = buddies = sprays = cards = titles = bundles = battlepass = null;
    prices = { timestamp: null };
}

export const getValorantVersion = async () => {
    console.log("Fetching current valorant version...");

    const req = await fetch("https://valorant-api.com/v1/version");
    console.assert(req.statusCode === 200, `Valorant version status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant version data status code is ${json.status}!`, json);

    return json.data;
}

export const loadSkinsJSON = async (filename = "data/skins.json") => {
    const jsonData = await asyncReadJSONFile(filename).catch(() => { });
    if (!jsonData || jsonData.formatVersion !== formatVersion) return;

    weapons = jsonData.weapons;
    skins = jsonData.skins;
    prices = jsonData.prices;
    rarities = jsonData.rarities;
    bundles = jsonData.bundles;
    buddies = jsonData.buddies;
    sprays = jsonData.sprays;
    cards = jsonData.cards;
    titles = jsonData.titles;
    battlepass = jsonData.battlepass;
}

export const saveSkinsJSON = (filename = "data/skins.json") => {
    fs.writeFileSync(filename, JSON.stringify({ formatVersion, gameVersion, weapons, skins, prices, bundles, rarities, buddies, sprays, cards, titles, battlepass }, null, 2));
}

export const fetchData = async (types = null, checkVersion = false) => {
    try {
        if (checkVersion || !gameVersion) {
            gameVersion = (await getValorantVersion()).manifestId;
            await loadSkinsJSON();
        }

        if (types === null) types = [skins, prices, bundles, rarities, buddies, cards, sprays, titles, battlepass];

        const promises = [];

        if (types.includes(skins) && (!skins || skins.version !== gameVersion)) promises.push(getSkinList(gameVersion));
        if (types.includes(prices) && (!prices || prices.version !== gameVersion)) promises.push(getPrices(gameVersion));
        if (types.includes(bundles) && (!bundles || bundles.version !== gameVersion)) promises.push(getBundleList(gameVersion));
        if (types.includes(rarities) && (!rarities || rarities.version !== gameVersion)) promises.push(getRarities(gameVersion));
        if (types.includes(buddies) && (!buddies || buddies.version !== gameVersion)) promises.push(getBuddies(gameVersion));
        if (types.includes(cards) && (!cards || cards.version !== gameVersion)) promises.push(getCards(gameVersion));
        if (types.includes(sprays) && (!sprays || sprays.version !== gameVersion)) promises.push(getSprays(gameVersion));
        if (types.includes(titles) && (!titles || titles.version !== gameVersion)) promises.push(getTitles(gameVersion));
        if (types.includes(battlepass) && (!battlepass || battlepass.version !== gameVersion)) promises.push(fetchBattlepassInfo(gameVersion));

        if (!prices || Date.now() - prices.timestamp > 24 * 60 * 60 * 1000) promises.push(getPrices(gameVersion)); // refresh prices every 24h

        if (promises.length === 0) return;
        await Promise.all(promises);

        saveSkinsJSON();

        // we fetched the skins, tell other shards to load them
        if (client.shard) sendShardMessage({ type: "skinsReload" });
    } catch (e) {
        console.error("There was an error while trying to fetch skin data!");
        console.error(e);
    }
}

export const getSkinList = async (gameVersion) => {
    console.log("Fetching valorant skin list...");

    const req = await fetch("https://valorant-api.com/v1/weapons?language=all");
    console.assert(req.statusCode === 200, `Valorant skins status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant skins data status code is ${json.status}!`, json);

    skins = { version: gameVersion };
    weapons = {};
    for (const weapon of json.data) {
        weapons[weapon.uuid] = {
            uuid: weapon.uuid,
            names: weapon.displayName,
            icon: weapon.displayIcon,
            defaultSkinUuid: weapon.defaultSkinUuid,
        }
        for (const skin of weapon.skins) {
            const levelOne = skin.levels[0];

            let icon;
            if (skin.themeUuid === "5a629df4-4765-0214-bd40-fbb96542941f") { // default skins
                icon = skin.chromas[0] && skin.chromas[0].fullRender;
            } else {
                for (let i = 0; i < skin.levels.length; i++) {
                    if (skin.levels[i] && skin.levels[i].displayIcon) {
                        icon = skin.levels[i].displayIcon;
                        break;
                    }
                }
            }
            if (!icon) icon = null;
            skins[levelOne.uuid] = {
                uuid: levelOne.uuid,
                skinUuid: skin.uuid,
                weapon: weapon.uuid,
                names: skin.displayName,
                icon: icon,
                rarity: skin.contentTierUuid,
                defaultSkinUuid: weapon.defaultSkinUuid,
                levels: skin.levels,
                chromas: skin.chromas,
            }
        }
    }

    saveSkinsJSON();
}

const getPrices = async (gameVersion, id = null) => {
    if (!config.fetchSkinPrices) return;

    // if no ID is passed, try with all users
    if (id === null) {
        for (const id of getUserList()) {
            const user = getUser(id);
            if (!user || !user.auth) continue;

            const success = await getPrices(gameVersion, id);
            if (success) return true;
        }
        return false;
    }

    let user = getUser(id);
    if (!user) return false;

    const authSuccess = await authUser(id);
    if (!authSuccess.success || !user.auth.rso || !user.auth.ent || !user.region) return false;

    user = getUser(id);
    console.log(`Fetching skin prices using ${user.username}'s access token...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetOffers.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/offers/`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins prices code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        return false; // user rso is invalid, should we delete the user as well?
    } else if (isMaintenance(json)) return false;

    prices = { version: gameVersion };
    for (const offer of json.Offers) {
        prices[offer.OfferID] = offer.Cost[Object.keys(offer.Cost)[0]];
    }

    prices.timestamp = Date.now();

    saveSkinsJSON();

    return true;
}

const getBundleList = async (gameVersion) => {
    console.log("Fetching valorant bundle list...");

    const req = await fetch("https://valorant-api.com/v1/bundles?language=all");
    console.assert(req.statusCode === 200, `Valorant bundles status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant bundles data status code is ${json.status}!`, json);

    bundles = { version: gameVersion };
    for (const bundle of json.data) {
        bundles[bundle.uuid] = {
            uuid: bundle.uuid,
            names: bundle.displayName,
            subNames: bundle.displayNameSubText,
            descriptions: bundle.extraDescription,
            icon: bundle.displayIcon,
            items: null,
            price: null,
            basePrice: null,
            expires: null,
            last_seen: null
        }
    }

    saveSkinsJSON();
}

export const addBundleData = async (bundleData) => {
    await fetchData([bundles]);

    const bundle = bundles[bundleData.uuid];
    if (bundle) {
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
    if (!config.fetchSkinRarities) return false;

    console.log("Fetching skin rarities list...");

    const req = await fetch("https://valorant-api.com/v1/contenttiers/");
    console.assert(req.statusCode === 200, `Valorant rarities status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant rarities data status code is ${json.status}!`, json);

    rarities = { version: gameVersion };
    for (const rarity of json.data) {
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
    console.log("Fetching gun buddies list...");

    const req = await fetch("https://valorant-api.com/v1/buddies?language=all");
    console.assert(req.statusCode === 200, `Valorant buddies status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant buddies data status code is ${json.status}!`, json);

    buddies = { version: gameVersion };
    for (const buddy of json.data) {
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
    console.log("Fetching player cards list...");

    const req = await fetch("https://valorant-api.com/v1/playercards?language=all");
    console.assert(req.statusCode === 200, `Valorant cards status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant cards data status code is ${json.status}!`, json);

    cards = { version: gameVersion };
    for (const card of json.data) {
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
    console.log("Fetching sprays list...");

    const req = await fetch("https://valorant-api.com/v1/sprays?language=all");
    console.assert(req.statusCode === 200, `Valorant sprays status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant sprays data status code is ${json.status}!`, json);

    sprays = { version: gameVersion };
    for (const spray of json.data) {
        sprays[spray.uuid] = {
            uuid: spray.uuid,
            names: spray.displayName,
            icon: spray.fullTransparentIcon || spray.displayIcon
        }
    }

    saveSkinsJSON();
}

export const getTitles = async (gameVersion) => {
    console.log("Fetching player titles list...");

    const req = await fetch("https://valorant-api.com/v1/playertitles?language=all");
    console.assert(req.statusCode === 200, `Valorant titles status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant titles data status code is ${json.status}!`, json);

    titles = { version: gameVersion };
    for (const title of json.data) {
        titles[title.uuid] = {
            uuid: title.uuid,
            names: title.displayName,
            text: title.titleText
        }
    }

    saveSkinsJSON();
}

export const fetchBattlepassInfo = async (gameVersion) => {
    console.log("Fetching battlepass UUID and end date...");

    // terminology for this function:
    // act = one in-game period with one battlepass, usually around 2 months
    // episode = 3 acts
    // season = both act and episode. basically any "event" with a start and end date.

    // fetch seasons data (current act end date)
    const req1 = await fetch("https://valorant-api.com/v1/seasons");
    console.assert(req1.statusCode === 200, `Valorant seasons status code is ${req1.statusCode}!`, req1);

    const seasons_json = JSON.parse(req1.body);
    console.assert(seasons_json.status === 200, `Valorant seasons data status code is ${seasons_json.status}!`, seasons_json);

    // fetch battlepass data (battlepass uuid)
    const req2 = await fetch("https://valorant-api.com/v1/contracts");
    console.assert(req2.statusCode === 200, `Valorant contracts status code is ${req2.statusCode}!`, req2);

    const contracts_json = JSON.parse(req2.body);
    console.assert(contracts_json.status === 200, `Valorant contracts data status code is ${contracts_json.status}!`, contracts_json);

    // we need to find the "current battlepass season" i.e. the last season to have a battlepass.
    // it's not always the current season, since between acts there is sometimes a period during
    // server maintenance where the new act has started but there is no battlepass contract for it yet.

    // get all acts
    // const seasonUuids = seasons_json.data.filter(season => season.type === "EAresSeasonType::Act").map(season => season.uuid);
    const all_acts = seasons_json.data.filter(season => season.type === "EAresSeasonType::Act");
    // sort them by start date (oldest first)
    all_acts.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    // and reverse
    all_acts.reverse();
    // we sort then reverse instead of just sorting the other way round directly, because most likely
    // the acts are already sorted beforehand, so this is more efficient.

    // get all battlepass contracts
    const all_bp_contracts = contracts_json.data.filter(contract => contract.content.relationType === "Season");

    // find the last act that has a battlepass
    let currentSeason = null;
    let currentBattlepass = null;
    for (const act of all_acts) {
        const bp_contract = all_bp_contracts.find(contract => contract.content.relationUuid === act.uuid);
        if (bp_contract) {
            currentSeason = act;
            currentBattlepass = bp_contract;
            break;
        }
    }

    // save data
    battlepass = {
        version: gameVersion,
        uuid: currentBattlepass.uuid,
        end: currentSeason.endTime,
        chapters: currentBattlepass.content.chapters
    }

    saveSkinsJSON();
}

export const getItem = async (uuid, type) => {
    switch (type) {
        case itemTypes.SKIN: return await getSkin(uuid);
        case itemTypes.BUDDY: return await getBuddy(uuid);
        case itemTypes.CARD: return await getCard(uuid);
        case itemTypes.SPRAY: return await getSpray(uuid);
        case itemTypes.TITLE: return await getTitle(uuid);
    }
}

export const getSkin = async (uuid, reloadData = true) => {
    if (reloadData) await fetchData([skins, prices]);

    let skin = skins[uuid];
    if (!skin) return null;

    skin.price = await getPrice(uuid);

    return skin;
}

export const getSkinFromSkinUuid = async (uuid, reloadData = true) => {
    if (reloadData) await fetchData([skins, prices]);

    let skin = Object.values(skins).find(skin => skin.skinUuid === uuid);
    if (!skin) return null;

    skin.price = await getPrice(skin.uuid);

    return skin;
}

export const getWeapon = async (uuid) => {
    await fetchData([skins]);

    return weapons[uuid] || null;
}

export const getPrice = async (uuid) => {
    if (!prices) await fetchData([prices]);

    if (prices[uuid]) return prices[uuid];

    if (!bundles) await fetchData([bundles]); // todo rewrite this part
    const bundle = Object.values(bundles).find(bundle => bundle.items?.find(item => item.uuid === uuid));
    if (bundle) {
        const bundleItem = bundle.items.find(item => item.uuid === uuid);
        return bundleItem.price || null;
    }

    return null;

}

export const getRarity = async (uuid) => {
    if (!rarities) await fetchData([rarities]);
    if (rarities) return rarities[uuid] || null;
}

export const getAllSkins = async () => {
    return await Promise.all(Object.values(skins).filter(o => typeof o === "object").map(skin => getSkin(skin.uuid, false)));
}

export const searchSkin = async (query, locale, limit = 20, threshold = -5000) => {
    await fetchData([skins, prices]);

    const valLocale = discToValLang[locale];
    const keys = [`names.${valLocale}`];
    if (valLocale !== DEFAULT_VALORANT_LANG) keys.push(`names.${DEFAULT_VALORANT_LANG}`);

    const allSkins = await getAllSkins()
    return fuzzysort.go(query, allSkins, {
        keys: keys,
        limit: limit,
        threshold: threshold,
        all: true
    });
}

export const getBundle = async (uuid) => {
    await fetchData([bundles]);
    return bundles[uuid];
}

export const getAllBundles = () => {
    // reverse the array so that the older bundles are first
    return Object.values(bundles).reverse().filter(o => typeof o === "object")
}

export const searchBundle = async (query, locale, limit = 20, threshold = -1000) => {
    await fetchData([bundles]);

    const valLocale = discToValLang[locale];
    const keys = [`names.${valLocale}`];
    if (valLocale !== DEFAULT_VALORANT_LANG) keys.push(`names.${DEFAULT_VALORANT_LANG}`);

    return fuzzysort.go(query, getAllBundles(), {
        keys: keys,
        limit: limit,
        threshold: threshold,
        all: true
    });
}

export const getBuddy = async (uuid) => {
    if (!buddies) await fetchData([buddies]);
    return buddies[uuid];
}

export const getSpray = async (uuid) => {
    if (!sprays) await fetchData([sprays]);
    return sprays[uuid];
}

export const getCard = async (uuid) => {
    if (!cards) await fetchData([cards]);
    return cards[uuid];
}

export const getTitle = async (uuid) => {
    if (!titles) await fetchData([titles]);
    return titles[uuid];
}

export const getBattlepassInfo = async () => {
    if (!battlepass) await fetchData([battlepass]);
    return battlepass;
}
