import config from "./config.js";
import fs from "fs";

/*let stats = {
    fileVersion: 2,
    stats: {}
};*/
let stats = {
    fileVersion: 3,
    shopStats: {},
    NMStats: {},
    lastNM: 0,
    nmUsersIncluded: []
};
let overallShopStats = {
    shopsIncluded: 0,
    items: {}
};

// todo check all occurences of renamed functions
export const loadStats = (filename="data/stats.json") => {
    if(!config.trackStoreStats) return;
    try {
        const obj = JSON.parse(fs.readFileSync(filename).toString());

        if(!obj.fileVersion) stats = transferStatsFromV1(obj);
        if(obj.fileVersion === 2) stats = transferStatsFromV2(obj);
        else stats = obj;

        saveStats(filename);

        calculateOverallShopStats();
        sortNMItemStats();
    } catch(e) {}
}

const saveStats = (filename="data/stats.json") => {
    fs.writeFileSync(filename, JSON.stringify(stats, null, 2));
}

export const calculateOverallShopStats = () => {
    cleanupStats();

    overallShopStats = {
        shopsIncluded: 0,
        items: {}
    }
    let items = {};

    for(let dateString in stats.shopStats) {
        if(config.statsExpirationDays && daysAgo(dateString) > config.statsExpirationDays) {
            // delete stats.shopStats[dateString];
            continue;
        }
        const dayStats = stats.shopStats[dateString];

        overallShopStats.shopsIncluded += dayStats.shopsIncluded;
        for(let item in dayStats.items) {
            if(item in items) {
                items[item] += dayStats.items[item];
            } else {
                items[item] = dayStats.items[item];
            }
        }
    }

    const sortedItems = Object.entries(items).sort(([,a], [,b]) => b - a);
    for(const [uuid, count] of sortedItems) {
        overallShopStats.items[uuid] = count;
    }
}

const sortNMItemStats = () => { // todo should this be exported? calculateOverallStats is
    const sortedItems = Object.entries(stats.NMStats).sort(([,a], [,b]) => b - a);

    stats.NMStats = {};
    for(const [uuid, count] of sortedItems) {
        stats.NMStats[uuid] = count;
    }
}

export const getOverallShopStats = () => {
    return overallShopStats || {};
}

export const getOverallNMStats = () => {
    return {
        NMsIncluded: stats.nmUsersIncluded.length,
        items: stats.NMStats
    };
}

export const getShopStatsFor = (uuid) => {
    return {
        shopsIncluded: overallShopStats.shopsIncluded,
        count: overallShopStats.items[uuid] || 0,
        rank: [Object.keys(overallShopStats.items).indexOf(uuid) + 1, Object.keys(overallShopStats.items).length]
    }
}

export const getNMStatsFor = (uuid) => {
    return {
        shopsIncluded: stats.nmUsersIncluded.length,
        count: stats.NMStats[uuid] || 0,
        rank: [Object.keys(stats.NMStats).indexOf(uuid) + 1, Object.keys(stats.NMStats).length]
    }
}

export const addStore = (puuid, items) => {
    if(!config.trackStoreStats) return;

    const today = formatDate(new Date());

    let todayStats = stats.shopStats[today];
    if(!todayStats) {
        todayStats = {
            shopsIncluded: 0,
            items: {},
            users: []
        };
        stats.shopStats[today] = todayStats;
    }

    if(todayStats.users.includes(puuid)) return;
    todayStats.users.push(puuid);

    for(const item of items) {
        if(item in todayStats.items) {
            todayStats.items[item]++;
        } else {
            todayStats.items[item] = 1;
        }
    }
    todayStats.shopsIncluded++;

    saveStats();

    calculateOverallShopStats();
}

export const addNightMarket = (puuid, items) => { // todo this
    if(!config.trackStoreStats) return;

    if(Date.now() - stats.lastNM > 1000 * 60 * 60 * 24 * 21) { // if last night market added was more than 21 days ago
        stats.NMStats = {};
        stats.nmUsersIncluded = [];
    }
    stats.lastNM = Date.now();

    if(stats.nmUsersIncluded.includes(puuid)) return;
    stats.nmUsersIncluded.push(puuid);

    for(const item of items) {
        if(item in stats.NMStats) {
            stats.NMStats[item]++;
        } else {
            stats.NMStats[item] = 1;
        }
    }

    saveStats();

    sortNMItemStats();
}

const cleanupStats = () => {
    if(!config.statsExpirationDays) return;

    for(const dateString in stats.shopStats) {
        if(daysAgo(dateString) > config.statsExpirationDays) {
            delete stats.shopStats[dateString];
        }
    }

    saveStats();
}

const formatDate = (date) => {
    return `${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`;
}

const daysAgo = (dateString) => {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const [day, month, year] = dateString.split("-");
    const date = new Date(Date.UTC(year, month - 1, day));

    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

const transferStatsFromV1 = (obj) => {
    const stats = {
        fileVersion: 2,
        stats: {}
    };
    stats.stats[formatDate(new Date())] = {
        shopsIncluded: obj.shopsIncluded,
        items: obj.itemStats,
        users: obj.usersAddedToday
    };
    return stats;
}

const transferStatsFromV2 = (obj) => {
    const stats = {
        fileVersion: 3,
        shopStats: {},
        NMStats: {},
        lastNM: 0,
        nmUsersIncluded: []
    };
    stats.shopStats = obj.stats;
    return stats;
}
