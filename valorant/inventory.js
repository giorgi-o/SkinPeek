import {fetch, isMaintenance, userRegion, WeaponTypeUuid} from "../misc/util.js";
import {authUser, deleteUserAuth, getUser} from "./auth.js";
import {authFailureMessage, basicEmbed, skinCollectionSingleEmbed, collectionOfWeaponEmbed} from "../discord/embed.js";
import config from "../misc/config.js";
import {s} from "../misc/languages.js";
import {riotClientHeaders} from "../misc/util.js";


export const getEntitlements = async (user, itemTypeId, itemType="item") => {
    // https://valapidocs.techchrism.me/endpoint/owned-items
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/entitlements/${user.puuid}/${itemTypeId}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        }
    });

    console.assert(req.statusCode === 200, `Valorant ${itemType} entitlements code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };

    return {
        success: true,
        entitlements: json
    }

}

const skinCache = {};

export const getSkins = async (user) => {
    // get all the owned skins of a user
    if(user.puuid in skinCache) {
        const cached = skinCache[user.puuid];
        const expiresIn = cached.timestamp - Date.now() + config.loadoutCacheExpiration;
        if(expiresIn <= 0) {
            delete skinCache[user.puuid];
        } else {
            console.log(`Fetched skins collection from cache for user ${user.username}! It expires in ${Math.ceil(expiresIn / 1000)}s.`);
            return {success: true, skins: cached.skins};
        }
    }

    const authResult = await authUser(user.id);
    if(!authResult.success) return authResult;

    const data = await getEntitlements(user, "e7c63390-eda7-46e0-bb7a-a6abdacd2433", "skins");
    if(!data.success) return data;

    const skins = data.entitlements.Entitlements.map(ent => ent.ItemID);

    skinCache[user.puuid] = {
        skins: skins,
        timestamp: Date.now()
    }

    console.log(`Fetched skins collection for ${user.username}`);

    return {
        success: true,
        skins: skins
    }
}


const loadoutCache = {};

export const getLoadout = async (user, account) => {
    // get the currently equipped skins of a user
    if(user.puuid in loadoutCache) {
        const cached = loadoutCache[user.puuid];
        const expiresIn = cached.timestamp - Date.now() + config.loadoutCacheExpiration;
        if(expiresIn <= 0) {
            delete loadoutCache[user.puuid];
        } else {
            console.log(`Fetched loadout from cache for user ${user.username}! It expires in ${Math.ceil(expiresIn / 1000)}s.`);
            return {success: true, loadout: cached.loadout, favorites: cached.favorites};
        }
    }

    const authResult = await authUser(user.id, account);
    if(!authResult.success) return authResult;

    user = getUser(user.id, account);
    console.log(`Fetching loadout for ${user.username}...`);

    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/personalization/v2/players/${user.puuid}/playerloadout`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        }
    });

    console.assert(req.statusCode === 200, `Valorant loadout fetch code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };

    const req2 = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/favorites/v1/players/${user.puuid}/favorites`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            ...riotClientHeaders(),
        }
    });

    console.assert(req.statusCode === 200, `Valorant favorites fetch code is ${req.statusCode}!`, req);

    const json2 = JSON.parse(req2.body);
    if (json2.httpStatus === 400 && json2.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false };
    } else if (isMaintenance(json2))
        return { success: false, maintenance: true };

    loadoutCache[user.puuid] = {
        loadout: json,
        favorites: json2,
        timestamp: Date.now()
    }

    console.log(`Fetched loadout for ${user.username}`);

    return {
        success: true,
        loadout: json,
        favorites: json2
    }
}

export const renderCollection = async (interaction, targetId=interaction.user.id, weaponName=null) => {
    const user = getUser(targetId);
    if(!user) return await interaction.reply({embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)]});

    if(weaponName) return await renderCollectionOfWeapon(interaction, targetId, weaponName);

    const loadout = await getLoadout(user);
    if (!loadout.success) return errorFetchingCollection(loadout, interaction, targetId);

    return await skinCollectionSingleEmbed(interaction, targetId, user, loadout);
}

const renderCollectionOfWeapon = async (interaction, targetId, weaponName) => {
    const user = getUser(targetId);
    const skins = await getSkins(user);
    if(!skins.success) return errorFetchingCollection(skins, interaction, targetId);

    return await collectionOfWeaponEmbed(interaction, targetId, user, WeaponTypeUuid[weaponName], skins.skins)
}

const errorFetchingCollection = (result, interaction, targetId) => {
    if(!result.success) {
        let errorText;
        if(targetId && targetId !== interaction.user.id) errorText = s(interaction).error.AUTH_ERROR_COLLECTION_OTHER.f({u: `<@${targetId}>`});
        else errorText = s(interaction).error.AUTH_ERROR_COLLECTION;

        return authFailureMessage(interaction, result, errorText);
    }
}