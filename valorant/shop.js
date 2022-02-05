import {authUser, deleteUser, getUser} from "./auth.js";
import {fetch, formatBundle, isMaintenance, MAINTENANCE} from "../misc/util.js";
import {addBundleData} from "./cache.js";

export const getShop = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess) return;

    const user = getUser(id);
    console.debug(`Fetching shop for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetStorefrontV2.md
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
    } else if(isMaintenance(json)) return MAINTENANCE;

    return json;
}

export const getOffers = async (id) => {
    const shop = await getShop(id);
    if(!shop || shop === MAINTENANCE) return shop;

    return {
        offers: shop.SkinsPanelLayout.SingleItemOffers,
        expires: Math.floor(Date.now() / 1000) + shop.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds
    };
}

export const getBundles = async (id) => {
    const shop = await getShop(id);
    if(!shop || shop === MAINTENANCE) return shop;

    const formatted = await Promise.all(shop.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle)));

    for(const bundle of formatted)
        await addBundleData(bundle);

    return formatted;
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
    console.assert(req.statusCode === 200, `Valorant balance code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") return;
    else if(isMaintenance(json)) return MAINTENANCE;

    return {
        vp: json.Balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
        rad: json.Balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"]
    };
}