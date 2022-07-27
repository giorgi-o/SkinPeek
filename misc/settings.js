import {readUserJson, saveUserJson} from "../valorant/accountSwitcher.js";
import {basicEmbed, secondaryEmbed, settingsEmbed} from "../discord/embed.js";
import {MessageActionRow, MessageSelectMenu} from "discord.js";
import {s} from "./languages.js";

export const settings = {
    hideIgn: {
        values: [true, false],
        default: false
    },
    privateShop: {
        values: [true, false],
        default: false
    }
}

export const defaultSettings = {};
for(const setting in settings) defaultSettings[setting] = settings[setting].default;

const getSettings = (id) => {
    const json = readUserJson(id);

    if(!json.settings) {
        json.settings = defaultSettings
        saveUserJson(id, json);
    }
    else for(const setting in defaultSettings) {
        let changed = false;
        if(!(setting in json.settings)) {
            json.settings[setting] = defaultSettings[setting];
            changed = true;
        }
        if(changed) saveUserJson(id, json);
    }

    return json.settings;
}

export const getSetting = (id, setting) => {
    return getSettings(id)[setting];
}

const setSetting = (id, setting, value) => {
    const json = readUserJson(id);

    json.settings[setting] = computerifyValue(value);

    saveUserJson(id, json);

    return json.settings[setting];
}

export const handleSettingsViewCommand = async (interaction) => {
    const settings = getSettings(interaction.user.id);

    await interaction.reply(settingsEmbed(settings, interaction));
}

export const handleSettingsSetCommand = async (interaction) => {
    const setting = interaction.options.getString("setting");

    const settingValues = settings[setting].values;

    const row = new MessageActionRow();

    const options = settingValues.splice(0, 25).map(value => {
        return {
            label: humanifyValue(value, interaction),
            value: `${setting}-${value}`
        }
    });

    row.addComponents(new MessageSelectMenu().setCustomId("set-setting").addOptions(options));

    await interaction.reply({
        embeds: [secondaryEmbed(s(interaction).settings.SET_QUESTION.f({s: settingName(setting, interaction)}))],
        components: [row]
    });
}

export const handleSettingDropdown = async (interaction) => {
    const [setting, value] = interaction.values[0].split('-');

    const valueSet = setSetting(interaction.user.id, setting, value);

    await interaction.update({
        embeds: [basicEmbed(s(interaction).settings.CONFIRMATION.f({s: settingName(setting, interaction), v: humanifyValue(valueSet, interaction)}))],
        components: []
    });
}

export const settingName = (setting, interaction) => {
    return s(interaction).settings[setting];
}

export const humanifyValue = (value, interaction) => {
    if(value === true) return s(interaction).settings.TRUE;
    if(value === false) return s(interaction).settings.FALSE;
    return value.toString();
}

const computerifyValue = (value) => {
    if(["true", "false"].includes(value)) return value === "true";
    if(!isNaN(parseInt(value))) return parseInt(value);
    return value;
}
