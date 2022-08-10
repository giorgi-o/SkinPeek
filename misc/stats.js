import config from "./config.js";
import fs from "fs";

let stats = {
    fileVersion: 2,
    stats: {}
};
let overallStats = {
    shopsIncluded: 0,
    items: {}
};

export const loadStats = (filename="data/stats.json") => {
    if(!config.trackStoreStats) return;
    try {
        const obj = JSON.parse(fs.readFileSync(filename).toString());

        if(!obj.fileVersion) transferStatsFromV1(obj);
        else stats = obj;

        saveStats(filename);

        calculateOverallStats();
    } catch(e) {}
}

const saveStats = (filename="data/stats.json") => {
    fs.writeFileSync(filename, JSON.stringify(stats, null, 2));
}

export const calculateOverallStats = () => {
    cleanupStats();

    overallStats = {
        shopsIncluded: 0,
        items: {}
    }
    let items = {};

    for(let dateString in stats.stats) {
        if(config.statsExpirationDays && daysAgo(dateString) > config.statsExpirationDays) {
            // delete stats.stats[dateString];
            continue;
        }
        const dayStats = stats.stats[dateString];

        overallStats.shopsIncluded += dayStats.shopsIncluded;
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
        overallStats.items[uuid] = count;
    }
}

export const getOverallStats = () => {
    loadStats();
    return overallStats || {};
}

export const getStatsFor = (uuid) => {
    loadStats();
    return {
        shopsIncluded: overallStats.shopsIncluded,
        count: overallStats.items[uuid] || 0,
        rank: [Object.keys(overallStats.items).indexOf(uuid) + 1, Object.keys(overallStats.items).length]
    }
}

export const addStore = (puuid, items) => {
    if(!config.trackStoreStats) return;

    loadStats();

    const today = formatDate(new Date());

    let todayStats = stats.stats[today];
    if(!todayStats) {
        todayStats = {
            shopsIncluded: 0,
            items: {},
            users: []
        };
        stats.stats[today] = todayStats;
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

    calculateOverallStats();
}

const cleanupStats = () => {
    if(!config.statsExpirationDays) return;

    for(const dateString in stats.stats) {
        if(daysAgo(dateString) > config.statsExpirationDays) {
            delete stats.stats[dateString];
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
    stats.stats[formatDate(new Date())] = {
        shopsIncluded: obj.shopsIncluded,
        items: obj.itemStats,
        users: obj.usersAddedToday
    };
}
