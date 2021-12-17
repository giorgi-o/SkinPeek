import fs from "fs";

import {fetch} from "./util.js";
import {authUser, getUser} from "./auth.js";

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
        skins: skins
    }

    fs.writeFileSync("skins.json", JSON.stringify(skinData));
}

const getSkin = async (uuid, checkVersion=false) => {
    if(checkVersion || !skinData.version) {
        if(!skinData.version) try {
            skinData = JSON.parse(fs.readFileSync("skins.json", 'utf-8'));
        } catch (e) {}

        const version = await getValorantVersion();
        if(version !== skinData.version) {
            await getSkinList(version);
        }
    }

    return skinData.skins[uuid];
}

export const getSkinOffers = async (id) => {
    await authUser(id);
    const user = getUser(id);
    const req = await fetch(`https://pd.${user.region}.a.pvp.net/store/v2/storefront/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });
    console.assert(req.statusCode === 200, `Valorant skins offers code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);

    const skinOffers = {offers: [], expires: json.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds};
    for(const uuid of json.SkinsPanelLayout.SingleItemOffers) {
        skinOffers.offers.push(await getSkin(uuid));
    }
    return skinOffers;
}

