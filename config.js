import fs from "fs";

export let config = {};
export default config;

export const loadConfig = (filename="config.json") => {
    let loadedConfig;
    try {
        loadedConfig = fs.readFileSync(filename, 'utf-8');
    } catch(e) {return console.error("Could not find config.json file!", e)}
    try {
        loadedConfig = JSON.parse(loadedConfig);
    } catch (e) {return console.error("Could not JSON parse config file!", e)}

    if(!loadedConfig.token || loadedConfig.token === "token goes here")
        return console.error("You forgot to put your bot token in config.json!");

    config.token            = loadedConfig.token;
    config.showSkinPrices   = loadedConfig.showSkinPrices || true;
    config.showSkinRarities = loadedConfig.showSkinRarities || true;
    config.storePasswords   = loadedConfig.storePasswords || false;

    saveConfig(filename, {...loadedConfig, ...config});

    return config;
}

const saveConfig = (filename, config) => {
    fs.writeFileSync(filename, JSON.stringify(config, null, 2));
}