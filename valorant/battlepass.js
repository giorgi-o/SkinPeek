
import {authUser, deleteUserAuth, getUser} from "./auth.js";
import {fetch, isMaintenance, riotClientHeaders, userRegion} from "../misc/util.js";
import {getBattlepassInfo, getBuddy, getCard, getSkin, getSpray, getValorantVersion} from "./cache.js";
import {renderBattlepass} from "../discord/embed.js";
import {getEntitlements} from "./inventory.js";
import {l, s} from "../misc/languages.js";

const AVERAGE_UNRATED_XP_CONSTANT = 4200;
const SPIKERUSH_XP_CONSTANT = 1000;
const LEVEL_MULTIPLIER = 750;

const getWeeklies = async () => {
    console.log("Fetching mission data...");

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

const getNextReward = async (interaction, CurrentTier) => {
    if(CurrentTier === 55) return {
        tier: 56,
        rewardName: s(interaction).battlepass.FINISHED
    };

    const battlepassInfo = await getBattlepassInfo();
    const chapters = battlepassInfo.chapters.flatMap(chapter => chapter.levels) // only premium items
    const nextTier = chapters[CurrentTier];

    const rewardType = nextTier.reward.type;
    const rewardUUID = nextTier.reward.uuid;
    const xpAmount = nextTier.xp;

    switch(rewardType) {
        case "EquippableSkinLevel": {
            const skin = await getSkin(rewardUUID);
            return {
                tier: CurrentTier + 1,
                rewardName: l(skin.names, interaction),
                rewardIcon: skin.icon,
                rewardType: rewardType,
                XP: xpAmount
            };
        }
        case "EquippableCharmLevel": {
            const buddy = await getBuddy(rewardUUID)
            return {
                tier: CurrentTier + 1,
                rewardName: l(buddy.names, interaction),
                rewardIcon: buddy.icon,
                rewardType: rewardType,
                XP: xpAmount
            };
        }
        case "Currency":
            // Always 10 Radianite, no UUID and req needed, return Image Link and "Radianite"
            return {
                tier: CurrentTier + 1,
                rewardName: s(interaction).info.RADIANITE,
                rewardIcon: 'https://media.valorant-api.com/currencies/e59aa87c-4cbf-517a-5983-6e81511be9b7/displayicon.png',
                rewardType: rewardType,
                XP: xpAmount
            };
        case "PlayerCard": {
            const card = await getCard(rewardUUID);
            return {
                tier: CurrentTier + 1,
                rewardName: l(card.names, interaction),
                rewardIcon: card.icons.small,
                rewardType: rewardType,
                XP: xpAmount
            };
        }
        case "Spray": {
            const spray = await getSpray(rewardUUID);
            return {
                tier: CurrentTier + 1,
                rewardName: l(spray.names, interaction),
                rewardIcon: spray.icon,
                rewardType: rewardType,
                XP: xpAmount
            };
        }
    }
}


export const getBattlepassProgress = async (interaction, maxlevel, id=interaction.user.id) => {
    const authSuccess = await authUser(id);
    if (!authSuccess.success)
        return authSuccess;

    const user = getUser(id);
    console.log(`Fetching battlepass progress for ${user.username}...`);

    // https://github.com/techchrism/valorant-api-docs/blob/trunk/docs/Contracts/GET%20Contracts_Fetch.md
    const req = await fetch(`https://pd.${userRegion(user)}.a.pvp.net/contracts/v1/contracts/${user.puuid}`, {
        headers: {
            "Authorization": "Bearer " + user.auth.rso,
            "X-Riot-Entitlements-JWT": user.auth.ent,
            "X-Riot-ClientVersion": (await getValorantVersion()).riotClientVersion,
            ...riotClientHeaders(),
        }
    });

    console.assert(req.statusCode === 200, `Valorant battlepass code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if (json.httpStatus === 400 && json.errorCode === "BAD_CLAIMS") {
        deleteUserAuth(user);
        return { success: false };
    } else if (isMaintenance(json))
        return { success: false, maintenance: true };

    const battlepassInfo = await getBattlepassInfo();
    const contract = json.Contracts.find(contract => contract.ContractDefinitionID === battlepassInfo.uuid);

    const contractData = {
        progressionLevelReached: contract.ProgressionLevelReached,
        progressionTowardsNextLevel: contract.ProgressionTowardsNextLevel,
        totalProgressionEarned: contract.ContractProgression.TotalProgressionEarned,
        missions: {
            missionArray: json.Missions,
            weeklyCheckpoint: json.MissionMetadata.WeeklyCheckpoint
        }
    }

    const weeklyxp = await getWeeklyXP(contractData.missions);
    const battlepassPurchased = await getBattlepassPurchase(id);

    if(battlepassPurchased.success === false) // login failed
        return battlepassPurchased;

    // Calculate
    const season_end = new Date(battlepassInfo.end);
    const season_now = Date.now();
    const season_left = Math.abs(season_end - season_now);
    const season_days_left = Math.floor(season_left / (1000 * 60 * 60 * 24)); // 1000 * 60 * 60 * 24 is one day in milliseconds
    const season_weeks_left = season_days_left / 7;

    let totalxp = contractData.totalProgressionEarned;
    let totalxpneeded = 0;
    for (let i = 1; i <= maxlevel; i++) {
        totalxpneeded = totalxpneeded + await calculate_level_xp(i);
    }

    totalxpneeded = totalxpneeded - totalxp;

    let spikerush_xp = SPIKERUSH_XP_CONSTANT
    let average_unrated_xp = AVERAGE_UNRATED_XP_CONSTANT
    if (battlepassPurchased) {
        spikerush_xp = spikerush_xp * 1.03;
        average_unrated_xp = average_unrated_xp * 1.03;
    }

    return {
        success: true,
        bpdata: contractData,
        battlepassPurchased: battlepassPurchased,
        nextReward: await getNextReward(interaction, contractData.progressionLevelReached),
        season_days_left: season_days_left,
        totalxp: totalxp.toLocaleString(),
        xpneeded: (await calculate_level_xp(contractData.progressionLevelReached + 1) - contractData.progressionTowardsNextLevel).toLocaleString(),
        totalxpneeded: Math.max(0, totalxpneeded).toLocaleString(),
        weeklyxp: weeklyxp.toLocaleString(),
        spikerushneeded: Math.max(0, Math.ceil(totalxpneeded / spikerush_xp)).toLocaleString(),
        normalneeded: Math.max(0, Math.ceil(totalxpneeded / average_unrated_xp)).toLocaleString(),
        spikerushneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / spikerush_xp)).toLocaleString(),
        normalneededwithweeklies: Math.max(0, Math.ceil((totalxpneeded - weeklyxp) / average_unrated_xp)).toLocaleString(),
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
    console.log(`Fetching battlepass purchases for ${user.username}...`);

    const data = await getEntitlements(user, "f85cb6f7-33e5-4dc8-b609-ec7212301948", "battlepass");
    if(!data.success) return false;

    const battlepassInfo = await getBattlepassInfo();

    for (let entitlement of data.entitlements.Entitlements) {
        if (entitlement.ItemID === battlepassInfo.uuid) {
            return true;
        }
    }

    return false;
}

export const renderBattlepassProgress = async (interaction, targetId=interaction.user.id) => {
    const maxlevel = interaction.options && interaction.options.getInteger("maxlevel") || 50;
    const battlepassProgress = await getBattlepassProgress(interaction, maxlevel, targetId);

    return await renderBattlepass(battlepassProgress, maxlevel, interaction, targetId);
}
