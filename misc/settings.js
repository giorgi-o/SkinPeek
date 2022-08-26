import {readUserJson, saveUserJson} from "../valorant/accountSwitcher.js";
import {basicEmbed, secondaryEmbed, settingsEmbed} from "../discord/embed.js";
import {MessageActionRow, MessageSelectMenu} from "discord.js";
import {s} from "./languages.js";

export const settings = {
    hideIgn: {
        values: [true, false],
        default: false
    },
    othersCanViewShop: {
        values: [true, false],
        default: true
    },
    othersCanViewColl: {
        values: [true, false],
        default: true
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
    else {
        let changed = false;

        for(const setting in defaultSettings) {
            if(!(setting in json.settings)) {
                json.settings[setting] = defaultSettings[setting];
                changed = true;
            }
        }

        for(const setting in json.settings) {
            if(!(setting in defaultSettings)) {
                delete json.settings[setting];
                changed = true;
            }
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

    const options = settingValues.slice(0, 25).map(value => {
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

export const humanifyValue = (value, interaction, emoji=false) => {
    if(value === true) return emoji ? '✅' : s(interaction).settings.TRUE;
    if(value === false) return emoji ? '❌' : s(interaction).settings.FALSE;
    return value.toString();
}

const computerifyValue = (value) => {
    if(["true", "false"].includes(value)) return value === "true";
    if(!isNaN(parseInt(value))) return parseInt(value);
    return value;
}
