import {fetch, isMaintenance, userRegion} from "../misc/util.js";
import {authUser, deleteUserAuth, getUser} from "./auth.js";
import {authFailureMessage, basicEmbed, skinCollectionSingleEmbed} from "../discord/embed.js";
import config from "../misc/config.js";
import {s} from "../misc/languages.js";


export const getEntitlements = async (user, itemTypeId, itemType="item") => {
    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetEntitlements.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/store/v1/entitlements/${user.puuid}/${itemTypeId}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent
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

export const getSkins = async (user) => {
    const data = await getEntitlements(user, "e7c63390-eda7-46e0-bb7a-a6abdacd2433", "skins");
    if(!data.success) return data;

    return {
        success: true,
        skins: data.entitlements.Entitlements.map(ent => ent.ItemID)
    }
}


const loadoutCache = {};

export const getLoadout = async (user, account) => {
    if(user.puuid in loadoutCache) {
        const cached = loadoutCache[user.puuid];
        if(Date.now() - cached.timestamp > config.loadoutCacheExpiration) {
            delete loadoutCache[user.puuid];
        } else {
            console.log(`Fetched loadout from cache for user ${user.username}! It expires in ${Math.ceil((cached.timestamp - Date.now() + config.loadoutCacheExpiration) / 1000)}s.`);
            return {success: true, loadout: cached.loadout};
        }
    }

    const authResult = await authUser(user.id, account);
    if(!authResult.success) return authResult;

    user = getUser(user.id, account);
    console.log(`Fetching loadout for ${user.username}...`);

    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/personalization/v2/players/${user.puuid}/playerloadout`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent
        }
    });

    console.assert(req.statusCode === 200, `Valorant loadout fetch code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };

    loadoutCache[user.puuid] = {
        loadout: json,
        timestamp: Date.now()
    }

    console.log(`Fetched loadout for ${user.username}`);

    return {
        success: true,
        loadout: json
    }
}

export const renderCollection = async (interaction, targetId=interaction.user.id) => {
    const user = getUser(targetId);
    if(!user) return await interaction.reply({embeds: [basicEmbed(s(interaction).error.NOT_REGISTERED)]});

    const loadout = await getLoadout(user);
    if(!loadout.success) {
        let errorText;
        if(targetId && targetId !== interaction.user.id) errorText = s(interaction).error.AUTH_ERROR_COLLECTION_OTHER.f({u: `<@${targetId}>`});
        else errorText = s(interaction).error.AUTH_ERROR_COLLECTION;

        return authFailureMessage(interaction, loadout, errorText);
    }

    return await skinCollectionSingleEmbed(interaction, targetId, user, loadout.loadout);
}
