import config from "../misc/config.js";
import unofficialValorantApi from "unofficial-valorant-api";
const VAPI = new unofficialValorantApi(config.HDevToken)

const xCache = {account: {}, mmrHistory: {}, matches:{}}

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

export const getAccountInfo = async (user) => {
    let cache = getCache(user, 'account');
    if(cache.success) return cache;

    const accountData = await VAPI.getAccountByPUUID({puuid: user.puuid, force: true});
    const mmrData = await VAPI.getMMRByPUUID({version: "v2",region: user.region, puuid: user.puuid});
    const mmr = {current_data: mmrData.data.current_data, highest_rank: mmrData.data.highest_rank};
    const data = {account:accountData.data, mmr: mmr}
    xCache["account"][user.puuid] = {data: data, timestamp: Date.now()};
    return {success: true, data: data};
}


export const getMmrHistory = async (user) => {
    let cache = getCache(user,'mmr');
    if(cache.success) return cache

    VAPI.getMMRHistoryByPUUID
}
