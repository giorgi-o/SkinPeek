import {authUser, deleteUser, getUser} from "./auth.js";
import {fetch, formatBundle, isMaintenance} from "../misc/util.js";
import {addBundleData} from "./cache.js";

export const getShop = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess.success) return authSuccess;

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
        deleteUser(id);
        return {success: false}
    } else if(isMaintenance(json)) return {success: false, maintenance: true};

    return {success: true, shop: json};
}

export const getOffers = async (id) => {
    const resp = await getShop(id);
    if(!resp.success) return resp;

    return {
        success: true,
        offers: resp.shop.SkinsPanelLayout.SingleItemOffers,
        expires: Math.floor(Date.now() / 1000) + resp.shop.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds
    };
}

export const getBundles = async (id) => {
    const resp = await getShop(id);
    if(!resp.success) return resp;

    const formatted = await Promise.all(resp.shop.FeaturedBundle.Bundles.map(rawBundle => formatBundle(rawBundle)));

    for(const bundle of formatted)
        await addBundleData(bundle);

    return {success: true, bundles: formatted};
}

export const getNightMarket = async (id) => {
    const resp = await getShop(id);
    if(!resp.success) return resp;

    if(!resp.shop.BonusStore) return {
        success: true,
        offers: false
    }

    return {
        success: true,
        offers: resp.shop.BonusStore.BonusStoreOffers,
        expires: Math.floor(Date.now() / 1000) + resp.shop.BonusStore.BonusStoreRemainingDurationInSeconds
    }
}

export const getBalance = async (id) => {
    const authSuccess = await authUser(id);
    if(!authSuccess.success) return authSuccess;

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
    if(json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUser(id);
        return {success: false};
    } else if(isMaintenance(json)) return {success: false, maintenance: true};

    return {
        success: true,
        vp: json.Balances["85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"],
        rad: json.Balances["e59aa87c-4cbf-517a-5983-6e81511be9b7"]
    };
}

