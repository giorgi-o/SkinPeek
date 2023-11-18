import {readUserJson, saveUserJson} from "../valorant/accountSwitcher.js";
import {basicEmbed, secondaryEmbed, settingsEmbed} from "../discord/embed.js";
import {ActionRowBuilder, StringSelectMenuBuilder} from "discord.js";
import {discLanguageNames, s} from "./languages.js";
import {findKeyOfValue} from "./util.js";

export const settings = {
    dailyShop: { // stores false or channel id
        set: (value, interaction) => value === 'true' ? interaction.channelId : false,
        render: (value, interaction) => {
            const isChannelId = (v) => !isNaN(parseFloat(v));
            if(isChannelId(value)) return s(interaction).info.ALERT_IN_CHANNEL.f({ c: value });
            return value;
        },
        choices: (interaction) => {
            // [interaction.channel?.name || s(interaction).info.ALERT_IN_DM_CHANNEL, false]
            // if the channel name is not in cache, assume it's a DM channel
            let channelOption = interaction.channel?.name
                ? s(interaction).info.ALERT_IN_CHANNEL_NAME.f({ c: interaction.channel.name }) 
                : s(interaction).info.ALERT_IN_DM_CHANNEL;
            return [channelOption, false];
        },
        values: [true, false],
        default: false
    },
    pingOnAutoDailyShop: {
        values: [true, false],
        default: true
    },
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
    },
    othersCanViewProfile: {
        values: [true, false],
        default: true
    },
    othersCanUseAccountButtons: {
        values: [true, false],
        default: true,
    },
    locale: {
        values: ["Automatic"], // locales will be added after imports finished processing
        default: "Automatic"
    },
    localeForced: {
        hidden: true
    }
}

// required due to circular dependency
setTimeout(() => settings.locale.values.push(...Object.keys(discLanguageNames)))

export const defaultSettings = {};
for(const setting in settings) defaultSettings[setting] = settings[setting].default;

const getSettings = (id) => {
    const json = readUserJson(id);
    if(!json) return defaultSettings;

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

export const setSetting = (interaction, setting, value, force=false) => { // force = whether is set from /settings set
    const id = interaction.user.id;
    const json = readUserJson(id);
    if(!json) return defaultSettings[setting]; // returns the default setting if the user does not have an account (this method may be a little bit funny, but it's better than an error)

    if(setting === "locale") {
        if(force) {
            json.settings.localeForced = value !== "Automatic";
            json.settings.locale = json.settings.localeForced ? computerifyValue(value) : "Automatic";
        }
        else if(!json.settings.localeForced) {
            json.settings.locale = value;
        }
    }
    else {
        let setValue = settings[setting].set ? settings[setting].set(value, interaction) : value;
        json.settings[setting] = computerifyValue(setValue);
    }

    saveUserJson(id, json);

    return json.settings[setting];
}

export const registerInteractionLocale = (interaction) => {
    const settings = getSettings(interaction.user.id);
    if(!settings.localeForced && settings.locale !== interaction.locale)
        setSetting(interaction, "locale", interaction.locale);
}

export const handleSettingsViewCommand = async (interaction) => {
    const settings = getSettings(interaction.user.id);

    await interaction.reply(settingsEmbed(settings, interaction));
}

export const handleSettingsSetCommand = async (interaction) => {
    const setting = interaction.options.getString("setting");

    const settingValues = settings[setting].values;
    const choices = settings[setting].choices?.(interaction) || [];

    const row = new ActionRowBuilder();

    const options = settingValues.slice(0, 25).map(value => {
        return {
            label: humanifyValue(choices.shift() || value, setting, interaction),
            value: `${setting}/${value}`
        }
    });

    row.addComponents(new StringSelectMenuBuilder().setCustomId("set-setting").addOptions(options));

    await interaction.reply({
        embeds: [secondaryEmbed(s(interaction).settings.SET_QUESTION.f({s: settingName(setting, interaction)}))],
        components: [row]
    });
}

export const handleSettingDropdown = async (interaction) => {
    const [setting, value] = interaction.values[0].split('/');

    const valueSet = setSetting(interaction, setting, value, true);

    await interaction.update({
        embeds: [basicEmbed(s(interaction).settings.CONFIRMATION.f({s: settingName(setting, interaction), v: humanifyValue(valueSet, setting, interaction)}))],
        components: []
    });
}

export const settingName = (setting, interaction) => {
    return s(interaction).settings[setting];
}

export const settingIsVisible = (setting) => {
    return !settings[setting].hidden;
}

export const humanifyValue = (value, setting, interaction, emoji=false) => {
    if(settings[setting].render) value = settings[setting].render(value, interaction);
    if(value === true) return emoji ? '✅' : s(interaction).settings.TRUE;
    if(value === false) return emoji ? '❌' : s(interaction).settings.FALSE;
    if(value === "Automatic") return (emoji ? "🌐 " : '') + s(interaction).settings.AUTO;
    if(Object.keys(discLanguageNames).includes(value)) return discLanguageNames[value];
    return value.toString();
}

const computerifyValue = (value) => {
    if(["true", "false"].includes(value)) return value === "true";
    if(!isNaN(parseInt(value)) && value.length < 15) return parseInt(value); // do not parse discord IDs
    if(Object.values(discLanguageNames).includes(value)) return findKeyOfValue(discLanguageNames, value);
    return value;
}
