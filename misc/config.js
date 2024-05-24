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
            console.error(`(Hint: If you can only see ${filename}, try enabling "file name extensions" in file explorer)`)
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

    if(loadedConfig.HDevTokenAlert && !loadedConfig.HDevToken || loadedConfig.HDevToken === ""){
        console.error("Looks like you didn't put a HDevToken in config.json!");
        console.error("The /profile command won't work without one. To get a key, see https://discord.gg/B7AarTMZMK");
        console.error("If you don't want to see this notification again, set HDevTokenAlert to false in config.json");
    }

    // backwards compatibility
    loadedConfig.fetchSkinPrices = loadedConfig.showSkinPrices;
    loadedConfig.fetchSkinRarities = loadedConfig.showSkinRarities;

    // to see what these keys do, check here:
    // https://github.com/giorgi-o/SkinPeek/wiki/SkinPeek-Admin-Guide#the-option-list

    applyConfig(loadedConfig, "token", "token goes here");
    applyConfig(loadedConfig, "HDevToken", "");
    applyConfig(loadedConfig, "HDevTokenAlert", true);
    //TODO applyConfig(loadedConfig, "useUnofficialValorantApi", true);
    applyConfig(loadedConfig, "fetchSkinPrices", true);
    applyConfig(loadedConfig, "fetchSkinRarities", true);
    applyConfig(loadedConfig, "localiseText", true);
    applyConfig(loadedConfig, "localiseSkinNames", true);
    applyConfig(loadedConfig, "linkItemImage", true);
    applyConfig(loadedConfig, "videoViewerWithSite", true);
    applyConfig(loadedConfig, "imageViewerWithSite", false);
    applyConfig(loadedConfig, "useEmojisFromServer", "");
    applyConfig(loadedConfig, "refreshSkins", "10 0 0 * * *");
    applyConfig(loadedConfig, "checkGameVersion", "*/15 * * * *");
    applyConfig(loadedConfig, "updateUserAgent", "*/15 * * * *");
    applyConfig(loadedConfig, "delayBetweenAlerts", 5 * 1000);
    applyConfig(loadedConfig, "alertsPerPage", 10);
    applyConfig(loadedConfig, "careerCacheExpiration", 10 * 60 * 1000);
    applyConfig(loadedConfig, "emojiCacheExpiration", 10 * 1000);
    applyConfig(loadedConfig, "loadoutCacheExpiration", 10 * 60 * 1000);
    applyConfig(loadedConfig, "useShopCache", true);
    applyConfig(loadedConfig, "useLoginQueue", false);
    applyConfig(loadedConfig, "loginQueueInterval", 3000);
    applyConfig(loadedConfig, "loginQueuePollRate", 2000);
    applyConfig(loadedConfig, "loginRetryTimeout", 10 * 60 * 1000);
    applyConfig(loadedConfig, "authFailureStrikes", 2);
    applyConfig(loadedConfig, "maxAccountsPerUser", 5);
    applyConfig(loadedConfig, "userDataCacheExpiration", 168);
    applyConfig(loadedConfig, "rateLimitBackoff", 60);
    applyConfig(loadedConfig, "rateLimitCap", 10 * 60);
    applyConfig(loadedConfig, "useMultiqueue", false);
    applyConfig(loadedConfig, "storePasswords", false);
    applyConfig(loadedConfig, "trackStoreStats", true);
    applyConfig(loadedConfig, "statsExpirationDays", 14);
    applyConfig(loadedConfig, "statsPerPage", 8);
    applyConfig(loadedConfig, "shardReadyTimeout", 60 * 1000);
    applyConfig(loadedConfig, "autoDeployCommands", true);
    applyConfig(loadedConfig, "ownerId", "");
    applyConfig(loadedConfig, "ownerName", "");
    applyConfig(loadedConfig, "status", "Up and running!");
    applyConfig(loadedConfig, "notice", "");
    applyConfig(loadedConfig, "onlyShowNoticeOnce", true);
    applyConfig(loadedConfig, "maintenanceMode", false);
    applyConfig(loadedConfig, "githubToken", "");
    applyConfig(loadedConfig, "logToChannel", "");
    applyConfig(loadedConfig, "logFrequency", "*/10 * * * * *");
    applyConfig(loadedConfig, "logUrls", false);

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
