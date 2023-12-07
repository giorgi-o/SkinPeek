import config from "../misc/config.js";
import unofficialValorantApi from "unofficial-valorant-api";
let VAPI;
if(config.HDevToken === undefined){
    setTimeout(() => {
        VAPI = new unofficialValorantApi(config.HDevToken) // It was starting without config
    }, 10000);
}else{
    VAPI = new unofficialValorantApi(config.HDevToken)
}
import { ordinalSuffix } from "../misc/util.js";
import {s} from "../misc/languages.js"

const xCache = {account: {}, matches:{}}
const getCache = (user, type) => {
    if(user.puuid in xCache[type]) {
        const cached = xCache[type][user.puuid];
        const expiresIn = cached.timestamp - Date.now() + config.careerCacheExpiration;
        if(expiresIn <= 0) {
            delete xCache[type][user.puuid];
            return {success: false};
        } else {
            console.log(`Fetched ${type} from cache for user ${user.username}! It expires in ${Math.ceil(expiresIn / 1000)}s.`);
            return {success: true, data: cached.data};
        }
    }
    return {success: false};
}

const progressCache = {acc: {}, mmr: {}, matches: {}, mmrHistory:{}}
const progress = (user, type, shouldBeDeleted=false) => {
    if(shouldBeDeleted) {
        delete progressCache[type][user.puuid];
        return;
    };
    if(user.puuid in progressCache[type]){
        return true;
    }else{
        progressCache[type][user.puuid] = true
        return false;
    }
}

export const getAccountInfo = async (user, interaction) => {
    let cache = getCache(user, 'account');
    if(cache.success) return cache;
    if(progress(user, 'acc') || progress(user, 'mmr')) return {success: false, error: s(interaction).error.WAIT_FOR_PREVIUS_REQUEST}
    const accountData = await VAPI.getAccountByPUUID({puuid: user.puuid, force: true});
    console.log(`Checked ACCData for ${user.id} R:${accountData?.ratelimits?.remaining} Reset: in ${accountData?.ratelimits?.reset} seconds`)
    const mmrData = await VAPI.getMMRByPUUID({version: "v2",region: user.region, puuid: user.puuid});
    console.log(`Checked MMRData for ${user.id} R:${mmrData?.ratelimits?.remaining} Reset: in ${mmrData?.ratelimits?.reset} seconds`)

    setTimeout(() => {
        progress(user, 'acc', true);
        progress(user, 'mmr', true);
    }, 1000);
    let err = accountData.error || mmrData.error
    if(err) return {success: false, error: err[0].message};
    

    const mmr = {current_data: mmrData.data.current_data, highest_rank: mmrData.data.highest_rank};
    const data = {account:accountData.data, mmr: mmr};

    xCache["account"][user.puuid] = {data: data, timestamp: Date.now()};
    return {success: true, data: data};
}




export const fetchMatchHistory = async (interaction, user, mode="competitive") => {
    let cache = getCache(user,'matches');
    if(cache.success) return cache;

    if(progress(user, 'matches') || mode==="competitive" && progress(user, 'mmrHistory')) return {success: false, error: s(interaction).error.WAIT_FOR_PREVIUS_REQUEST}
    const matchHistory = await VAPI.getMatchesByPUUID({puuid: user.puuid, region: user.region, filter: mode});
    console.log(`Checked match history for ${user.id} R:${matchHistory?.ratelimits?.remaining} Reset: in ${matchHistory?.ratelimits?.reset} seconds`)
    setTimeout(() => {progress(user, 'matches', true);}, 5000);
    if(matchHistory.error) return {success: false, error: matchHistory.error[0].message};
    else if(matchHistory.data.length === 0) return {success: false, error: s(interaction).error.NO_MATCH_DATA.f({m: mode})}
    let mmrHistory;
    if(mode === "competitive") {
        mmrHistory = await VAPI.getMMRHistoryByPUUID({puuid: user.puuid, region: user.region})
        console.log(`Checked MMRHistory for ${user.id} R:${mmrHistory?.ratelimits?.remaining} Reset: in ${mmrHistory?.ratelimits?.reset} seconds`)
        setTimeout(() => {progress(user, 'mmrHistory', true);}, 1000);
        if(mmrHistory.error) return {success: false, error: mmrHistory.error[0].message};
        const matches = []

        for (let i = 0; i < matchHistory.data.length; i++) {
            const match = matchHistory.data[i];
            const data = {metadata: {}, player: {}, teams: {}};
            const matchMMR = mmrHistory.data.find(item => item.match_id === match.metadata.matchid);
            const player = match.players.all_players.find(player => player.puuid === user.puuid);
            const playerPosition = match.players.all_players.slice().sort((a, b) => b.stats.score - a.stats.score).findIndex(player => player.puuid === user.puuid)+1

            data.player.hs_percent = Math.ceil(player.stats.headshots/(player.stats.headshots+player.stats.bodyshots+player.stats.legshots)*100);
            data.player.average_damage_round = (player.damage_made/match.metadata.rounds_played).toFixed(1);
            data.player.average_combat_score = (player.stats.score/match.metadata.rounds_played).toFixed(1);
            data.player.agent = {name: player.character, iconUrl: player.assets.agent.small};
            data.player.kills = player.stats.kills;
            data.player.deaths = player.stats.deaths;
            data.player.assists = player.stats.assists; //I know it looks horrible
            data.player.kd = (player.stats.kills/player.stats.deaths).toFixed(1);
            data.player.position = `${playerPosition}${ordinalSuffix(playerPosition)}`
            data.player.team = player.team
            data.metadata.map = match.metadata.map;
            data.metadata.game_start = match.metadata.game_start;
            data.metadata.game_length = match.metadata.game_length;
            data.metadata.pt_round_won = match.teams[player.team.toLowerCase()].rounds_won;
            data.metadata.et_round_won = match.teams[player.team.toLowerCase()].rounds_lost;
            data.teams = match.teams

            if(matchMMR){
                data.player.mmr = matchMMR.mmr_change_to_last_game;
                if(data.player.mmr > 0) data.player.mmr = `+${data.player.mmr}`
                data.player.currentTierImageUrl = matchMMR.images.large;
            }
            matches.push(data);
        }
        const data = {success: true, data: matches, timestamp: Date.now()};
        xCache["matches"][user.puuid] = data;
        return {success: true, data: data.data};
    }
}
