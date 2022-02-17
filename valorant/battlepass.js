import { authUser, deleteUser, getUser } from "./auth.js";
import { fetch, isMaintenance } from "../misc/util.js";
import { getValorantVersion } from "./cache.js";

const CONTRACT_UUID = "60f2e13a-4834-0a18-5f7b-02b1a97b7adb";
const AVERAGE_UNRATED_XP = 4200;
const SPIKERUSH_XP = 1000;
const LEVEL_MULTIPLIER = 750;
const SEASON_END = 'March 01, 2022'; // TODO fetch season end from API, maybe store that date to reduce calls?

const calculate_level_xp = async (level) => {
    if(level >= 2 && level <= 50) {
        return 2000 + (level - 2) * LEVEL_MULTIPLIER;
    } else if(level >= 51 && level <= 55) {
        return 36500
    } else {
        return 0
    }
}

export const getBattlepassProgress = async (id, maxlevel) => {
    const authSuccess = await authUser(id);
    if (!authSuccess.success)
        return authSuccess;

    const user = getUser(id);
    console.debug(`Fetching battlepass progress for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Contracts/GET%20Contracts_Fetch.md
    const req = await fetch(`https://pd.${user.region}.a.pvp.net/contracts/v1/contracts/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent,
            "X-Riot-ClientVersion": (await getValorantVersion()).riotClientVersion
        }
    });

    console.assert(req.statusCode === 200, `Valorant battlepass code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUser(id);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };


    let bpdata = {};
    json["Contracts"].forEach(contract => {
        if (contract.ContractDefinitionID === CONTRACT_UUID) {
            bpdata = {
                progressionLevelReached: contract.ProgressionLevelReached,
                progressionTowardsNextLevel: contract.ProgressionTowardsNextLevel,
                totalProgressionEarned: contract.ContractProgression.TotalProgressionEarned
            };
        }
    });

    // Calculate
    const total_weeks = 7;
    const season_end = new Date(SEASON_END);
    const season_now = Date.now();
    const season_left = Math.abs(season_end - season_now);
    const season_days_left = Math.floor(season_left / (1000 * 60 * 60 * 24)); // 1000 * 60 * 60 * 24 is one day in miliseconds
    const season_weeks_left = season_days_left / 7;

    let totalxp = bpdata.totalProgressionEarned;
    let totalxpneeded = 0;
    for (let i = 1; i <= maxlevel; i++) {
        totalxpneeded = totalxpneeded + await calculate_level_xp(i);
    }

    let weeklyxp = 0;

    // TODO: Fetch weekly missions and substract that from totalxpneeded

    totalxpneeded = totalxpneeded - (totalxp + weeklyxp);

    // TODO: Fetch battlepass purchases and check for ownership of current battlepass to add 3% XP bonus (https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetEntitlements.md)

    return {
        success: true,
        bpdata: bpdata,
        totalxp: totalxp.toLocaleString(),
        xpneeded: (await calculate_level_xp(bpdata.progressionLevelReached + 1) - bpdata.progressionTowardsNextLevel).toLocaleString(),
        totalxpneeded: Math.max(0, totalxpneeded).toLocaleString(),
        spikerushneeded: Math.max(0, Math.ceil(totalxpneeded / SPIKERUSH_XP)).toLocaleString(),
        normalneeded: Math.max(0, Math.ceil(totalxpneeded / AVERAGE_UNRATED_XP)).toLocaleString(),
        dailyxpneeded: Math.max(0, Math.ceil(totalxpneeded / season_days_left)).toLocaleString(),
        weeklyxpneeded: Math.max(0, Math.ceil(totalxpneeded / season_weeks_left)).toLocaleString()
    };
};
