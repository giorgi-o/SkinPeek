import config from "./config.js";
import fs from "fs";

let stats = {
    shopsIncluded: 0, // number of shops included in the stats
    lastAdded: 0, // timestamp of last time items were added
    itemStats: {}, // how many times each item was seen
    usersAddedToday: [], // to make sure we don't count a user's shop twice
};

export const loadStats = (filename="data/stats.json") => {
    if(!config.trackStoreStats) return;
    try {
        stats = JSON.parse(fs.readFileSync(filename).toString());
        saveStats(filename);
    } catch(e) {}
}

const saveStats = (filename="data/stats.json") => {
    fs.writeFileSync(filename, JSON.stringify(stats, null, 2));
}

export const addStore = (puuid, items) => {
    if(!config.trackStoreStats) return;

    const now = new Date();
    const lastAdded = new Date(stats.lastAdded);

    if(now.getFullYear() !== lastAdded.getFullYear() ||
    now.getMonth() !== lastAdded.getMonth() |
    now.getDate() !== lastAdded.getDate()) {
        stats.lastAdded = Date.now();
        stats.usersAddedToday = [];
    }

    if(stats.usersAddedToday.includes(puuid)) return;
    stats.usersAddedToday.push(puuid);

    for(const item of items) {
        if(item in stats.itemStats) {
            stats.itemStats[item]++;
        } else {
            stats.itemStats[item] = 1;
        }
    }
    stats.shopsIncluded++;

    saveStats();
}
