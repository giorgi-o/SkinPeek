import fs from "fs";

export let config = {};
export default config;

export const loadConfig = (filename="config.json") => {
    let loadedConfig;

    try {
        loadedConfig = fs.readFileSync(filename, 'utf-8');
    } catch(e) {
        try {
            fs.readFileSync(filename + ".example", 'utf-8');
            console.error(`You forgot to rename ${filename}.example to ${filename}!`);
        } catch(e1) {
            console.error(`Could not find ${filename}!`, e);
        }
        return;
    }

    try {
        loadedConfig = JSON.parse(loadedConfig);
    } catch (e) {return console.error(`Could not JSON parse ${filename}! Is it corrupt?`, e)}

    if(!loadedConfig.token || loadedConfig.token === "token goes here")
        return console.error("You forgot to put your bot token in config.json!");

    loadedConfig.fetchSkinPrices = loadedConfig.showSkinPrices;
    loadedConfig.fetchSkinRarities = loadedConfig.showSkinRarities;

    applyConfig(loadedConfig, "token", "token goes here");
    applyConfig(loadedConfig, "fetchSkinPrices", true);
    applyConfig(loadedConfig, "fetchSkinRarities", true);
    applyConfig(loadedConfig, "localiseSkinNames", true);
    applyConfig(loadedConfig, "linkItemImage", true);
    applyConfig(loadedConfig, "useEmojisFromServer", "");
    applyConfig(loadedConfig, "refreshSkins", "10 0 0 * * *");
    applyConfig(loadedConfig, "checkGameVersion", "*/15 * * * *");
    applyConfig(loadedConfig, "delayBetweenAlerts", 5 * 1000);
    applyConfig(loadedConfig, "alertsPerPage", 10);
    applyConfig(loadedConfig, "emojiCacheExpiration", 10 * 1000);
    applyConfig(loadedConfig, "loadoutCacheExpiration", 10 * 60 * 1000);
    applyConfig(loadedConfig, "useShopCache", true);
    applyConfig(loadedConfig, "useLoginQueue", false);
    applyConfig(loadedConfig, "loginQueue", "*/3 * * * * *");
    applyConfig(loadedConfig, "loginRetryTimeout", 10 * 60 * 1000);
    applyConfig(loadedConfig, "authFailureStrikes", 2);
    applyConfig(loadedConfig, "maxAccountsPerUser", 5);
    applyConfig(loadedConfig, "rateLimitBackoff", 60);
    applyConfig(loadedConfig, "useShopQueue", false);
    applyConfig(loadedConfig, "shopQueue", "*/1 * * * * *");
    applyConfig(loadedConfig, "storePasswords", false);
    applyConfig(loadedConfig, "trackStoreStats", false);
    applyConfig(loadedConfig, "statsExpirationDays", 14);
    applyConfig(loadedConfig, "statsPerPage", 8);
    applyConfig(loadedConfig, "shardReadyTimeout", 60 * 1000);
    applyConfig(loadedConfig, "ownerId", "");
    applyConfig(loadedConfig, "ownerName", "");
    applyConfig(loadedConfig, "status", "Up and running!");
    applyConfig(loadedConfig, "logToChannel", "");
    applyConfig(loadedConfig, "logFrequency", "*/10 * * * * *");

    saveConfig(filename, config);

    return config;
}

export const saveConfig = (filename="config.json", configToSave) => {
    fs.writeFileSync(filename, JSON.stringify(configToSave || config, null, 2));
}

const applyConfig = (loadedConfig, name, defaultValue) => {
    if(loadedConfig[name] === undefined) config[name] = defaultValue;
    else config[name] = loadedConfig[name];
}
