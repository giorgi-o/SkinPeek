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
    applyConfig(loadedConfig, "linkItemImage", true);
    applyConfig(loadedConfig, "refreshSkins", "10 0 0 * * *");
    applyConfig(loadedConfig, "checkGameVersion", "*/15 * * * *");
    applyConfig(loadedConfig, "cleanupAccounts", "0 * * * *");
    applyConfig(loadedConfig, "storePasswords", false);

    saveConfig(filename, config);

    return config;
}

const saveConfig = (filename, config) => {
    fs.writeFileSync(filename, JSON.stringify(config, null, 2));
}

const applyConfig = (loadedConfig, name, defaultValue) => {
    if(loadedConfig[name] === undefined) config[name] = defaultValue;
    else config[name] = loadedConfig[name];
}