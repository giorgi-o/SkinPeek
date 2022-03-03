import { authUser, deleteUser, getUser } from "./auth.js";
import { fetch, isMaintenance } from "../misc/util.js";
import { getValorantVersion } from "./cache.js";

const CONTRACT_UUID = "c1cd8895-4bd2-466d-e7ff-b489e3bc3775";
let AVERAGE_UNRATED_XP = 4200;
let SPIKERUSH_XP = 1000;
const LEVEL_MULTIPLIER = 750;
const SEASON_END = 'April 27, 2022'; // TODO fetch season end from API, maybe store that date to reduce calls?

const getWeeklies = async () => {
    console.debug("Fetching mission data...");

    const req = await fetch("https://valorant-api.com/v1/missions");
    console.assert(req.statusCode === 200, `Valorant mission status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    console.assert(json.status === 200, `Valorant mission data status code is ${json.status}!`, json);

    const now = Date.now();
    let weeklyData = {};
    json["data"].forEach(mission => {
        if (mission.type === "EAresMissionType::Weekly" && new Date(mission.expirationDate) > now) {
            if (!weeklyData[mission.activationDate]) {
                weeklyData[mission.activationDate] = {}
            }
            weeklyData[mission.activationDate][mission.uuid] = {
                title: mission.title,
                xpGrant: mission.xpGrant,
                progressToComplete: mission.progressToComplete,
                activationDate: mission.activationDate
            }
        }
    });
    return weeklyData;
}

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


    let contractData = {};
    json["Contracts"].forEach(contract => {
        if (contract.ContractDefinitionID === CONTRACT_UUID) {
            contractData = {
                progressionLevelReached: contract.ProgressionLevelReached,
                progressionTowardsNextLevel: contract.ProgressionTowardsNextLevel,
                totalProgressionEarned: contract.ContractProgression.TotalProgressionEarned
            };
        }

    contractData["missions"] = {
        missionArray: json.Missions,
        weeklyCheckpoint: json.MissionMetadata.WeeklyCheckpoint
    }
    });

    const weeklyxp = await getWeeklyXP(contractData.missions);
    const battlepassPurchased = await getBattlepassPurchase(id);

    // Calculate
    const season_end = new Date(SEASON_END);
    const season_now = Date.now();
    const season_left = Math.abs(season_end - season_now);
    const season_days_left = Math.floor(season_left / (1000 * 60 * 60 * 24)); // 1000 * 60 * 60 * 24 is one day in miliseconds
    const season_weeks_left = season_days_left / 7;

    let totalxp = contractData.totalProgressionEarned;
    let totalxpneeded = 0;
    for (let i = 1; i <= maxlevel; i++) {
        totalxpneeded = totalxpneeded + await calculate_level_xp(i);
    }

    totalxpneeded = totalxpneeded - totalxp;

    if (battlepassPurchased) {
        SPIKERUSH_XP = SPIKERUSH_XP * 1.03;
        AVERAGE_UNRATED_XP = AVERAGE_UNRATED_XP * 1.03;
    }

    return {
        success: true,
        bpdata: contractData,
        battlepassPurchased: battlepassPurchased,
        totalxp: totalxp.toLocaleString(),
        xpneeded: (await calculate_level_xp(contractData.progressionLevelReached + 1) - contractData.progressionTowardsNextLevel).toLocaleString(),
        totalxpneeded: Math.max(0, totalxpneeded).toLocaleString(),
        weeklyxp: weeklyxp.toLocaleString(),
        spikerushneeded: Math.max(0, Math.ceil(totalxpneeded / SPIKERUSH_XP)).toLocaleString(),
        normalneeded: Math.max(0, Math.ceil(totalxpneeded / AVERAGE_UNRATED_XP)).toLocaleString(),
        spikerushneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / SPIKERUSH_XP)).toLocaleString(),
        normalneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / AVERAGE_UNRATED_XP)).toLocaleString(),
        dailyxpneeded: Math.max(0, Math.ceil(totalxpneeded / season_days_left)).toLocaleString(),
        weeklyxpneeded: Math.max(0, Math.ceil(totalxpneeded / season_weeks_left)).toLocaleString(),
        dailyxpneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / season_days_left)).toLocaleString(),
        weeklyxpneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / season_weeks_left)).toLocaleString()
    };
};

const getWeeklyXP = async (userMissionsObj) => {
    const seasonWeeklyMissions = await getWeeklies();
    let xp = 0

    // Check if user has not completed every weekly and add xp from that
    if (userMissionsObj.missionArray.length > 2) {
        userMissionsObj.missionArray.forEach(userMission => {
            if (!userMission.Complete) {
                Object.entries(seasonWeeklyMissions).forEach(([date, weeklyMissions]) => {
                    Object.entries(weeklyMissions).forEach(([uuid, missionDetails]) => {
                        if (uuid === userMission.ID) {
                            xp = xp + missionDetails.xpGrant;
                            userMissionsObj.weeklyCheckpoint = missionDetails.activationDate; // update checkpoint to prevent adding this weeks XP later on
                        }
                    });
                });
            }
        });
    }

    // Add XP from future weeklies
    Object.entries(seasonWeeklyMissions).forEach(([date, weeklyMission]) => {
        if (new Date(date) > new Date(userMissionsObj.weeklyCheckpoint))  {
            Object.entries(weeklyMission).forEach(([uuid, missionDetails]) => {
                xp = xp + missionDetails.xpGrant;
            });
       }
    });

    return xp
}

const getBattlepassPurchase = async (id) => {
    const authSuccess = await authUser(id);
    if (!authSuccess.success)
        return authSuccess;

    const user = getUser(id);
    console.debug(`Fetching battlepass purchases for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Store/GET%20Store_GetEntitlements.md
    const req = await fetch(`https://pd.${user.region}.a.pvp.net/store/v1/entitlements/${user.puuid}/f85cb6f7-33e5-4dc8-b609-ec7212301948`, {
        headers: {
            "Authorization": "Bearer " + user.rso,
            "X-Riot-Entitlements-JWT": user.ent
        }
    });

    console.assert(req.statusCode === 200, `Valorant battlepass purchases code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUser(id);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };


    for (let entitlement of json.Entitlements) {
        if (entitlement.ItemID === CONTRACT_UUID) {
            return true;
        }
    };
    
    return false;
}
