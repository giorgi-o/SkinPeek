import fs from "fs";

import {asyncReadJSONFile, fetch} from "./util.js";
import {authUser, deleteUser, getUser, getUserList} from "./auth.js";
import config from "../config.js";

let skinData = {version: null};

const getValorantVersion = async () => {
    const req = await fetch("https://valorant-api.com/v1/version");
    console.assert(req.statusCode === 200, `Valorant version status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant version data status code is ${json.status}!`, json);

    return json.data.manifestId;
}

const getSkinList = async (valorantVersion=null) => {
    const req = await fetch("https://valorant-api.com/v1/weapons/skinlevels");
    console.assert(req.statusCode === 200, `Valorant skins status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant skins data status code is ${json.status}!`, json);

    const skins = {};
    for(const skin of json.data) {
        skins[skin.uuid] = {
            name: skin.displayName,
            icon: skin.displayIcon
        }
    }

    skinData = {
        version: valorantVersion || await getValorantVersion(),
        skins: skins,
    }

    await getPrices();

    fs.writeFileSync("skins.json", JSON.stringify(skinData));
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
        if(offer.OfferID in skinData.skins) skinData.skins[offer.OfferID].price = offer.Cost[Object.keys(offer.Cost)[0]];
    }

    return true;
}

const getSkin = async (uuid, id, checkVersion=false) => {
    if(checkVersion || !skinData.version) {
        if(!skinData.version) skinData = asyncReadJSONFile("skins.json").catch(() => {});

        const version = await getValorantVersion();
        if(version !== skinData.version) {
            await getSkinList(version);
        }
    }

    let skin = skinData.skins[uuid];
    if(!skin.price) await getPrices(id);

    return skin;
}

export const getSkinOffers = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess) return;

    const user = getUser(id);
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

    const skinOffers = {offers: [], expires: json.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds};
    for(const uuid of json.SkinsPanelLayout.SingleItemOffers) {
        skinOffers.offers.push(await getSkin(uuid, id));
    }
    return skinOffers;
}
