import fs from "fs";
import config from "./config.js";
import {getSetting} from "./settings.js";
import {Interaction} from "discord.js";
import {User} from "../valorant/auth.js";

// languages valorant doesn't have:
// danish, croatian, lithuanian, hungarian, dutch, norwegian, romanian, finnish, swedish, czech, greek, bulgarian, ukranian, hindi
// languages discord doesn't have:
// arabic, mexican spanish, indonesian
export const discToValLang = {
    'de'   : 'de-DE',
    'en-GB': 'en-US', // :(
    'en-US': 'en-US',
    'es-ES': 'es-ES',
    'fr'   : 'fr-FR',
    'it'   : 'it-IT',
    'pl'   : 'pl-PL',
    'pt-BR': 'pt-BR',
    'vi'   : 'vi-VN',
    'tr'   : 'tr-TR',
    'ru'   : 'ru-RU',
    'th'   : 'th-TH',
    'zh-CN': 'zh-CN',
    'ja'   : 'ja-JP',
    'zh-TW': 'zh-TW',
    'ko'   : 'ko-KR',

    // valorant languages, that discord doesn't support
    'ar-AE': 'ar-AE',
    'es-MX': 'es-MX',
    'id-ID': 'id-ID'
}

export const valToDiscLang = {};
Object.keys(discToValLang).forEach(discLang => {
    valToDiscLang[discToValLang[discLang]] = discLang;
});

export const discLanguageNames = {
    'de'   : '🇳🇱 Deutsch',
    'en-GB': '🇬🇧 English (UK)',
    'en-US': '🇺🇸 English (US)',
    'es-ES': '🇪🇸 Español',
    'fr'   : '🇫🇷 Français',
    'it'   : '🇮🇹 Italiano',
    'pl'   : '🇵🇱 Polski',
    'pt-BR': '🇧🇷 Português (Brasil)',
    'vi'   : '🇻🇳 Tiếng Việt',
    'tr'   : '🇹🇷 Türkçe',
    'ru'   : '🇷🇺 Русский',
    'th'   : '🇹🇭 ไทย',
    'zh-CN': '🇨🇳 简体中文',
    'ja'   : '🇯🇵 日本語',
    'zh-TW': '🇹🇼 繁體中文',
    'ko'   : '🇰🇷 한국어',

    // valorant languages, that discord doesn't support
    'ar-AE': '🇸🇦 العربية',
    'es-MX': '🇲🇽 Español (México)',
    'id-ID': '🇮🇩 Bahasa Indonesia'
}

export const DEFAULT_LANG = 'en-GB';
export const DEFAULT_VALORANT_LANG = 'en-US';

const languages = {};

const importLanguage = (language) => {
    let languageStrings;
    try {
        languageStrings = JSON.parse(fs.readFileSync(`./languages/${language}.json`, 'utf-8'));
    } catch (e) {
        if(language === DEFAULT_LANG) console.error(`Couldn't load ${DEFAULT_LANG}.json! Things will break.`);
        return;
    }

    if(language === DEFAULT_LANG) {
        languages[language] = languageStrings;
        return;
    }

    const languageHandler = {};
    for(const category in languageStrings) {
        if(typeof languageStrings[category] !== 'object') continue;
        languageHandler[category] = new Proxy(languageStrings[category], {
            get: (target, prop) => {
                if(prop in target) return target[prop];
                return languages[DEFAULT_LANG][category][prop] || prop;
            }
        });
    }

    for(const category in languages[DEFAULT_LANG]) {
        if(!languageHandler[category]) languageHandler[category] = languages[DEFAULT_LANG][category];
    }

    languages[language] = languageHandler;
}
importLanguage(DEFAULT_LANG);

// get the strings for a language
export const s = (interaction) => {
    if(typeof interaction === 'string') return languages[interaction] || languages[DEFAULT_LANG];
    if(!interaction || !interaction.locale && !interaction.user) return languages[DEFAULT_LANG];

    let lang;
    if(interaction instanceof User) lang = interaction.locale;
    else if(interaction instanceof Interaction) lang = getSetting(interaction.user.id, 'locale') || interaction.locale;
    else {
        console.error("I don't know how to localise this! This is a bug, please tell Giorgio about it.");
        console.error(interaction);
        lang = DEFAULT_LANG;
    }

    if(!languages[lang]) importLanguage(lang);
    return languages[lang] || languages[DEFAULT_LANG];
}

// format a string
String.prototype.f = function(args, interactionOrId=null) {
    args = hideUsername(args, interactionOrId);
    let str = this;
    for(let i in args)
        str = str.replace(`{${i}}`, args[i]);
    return str;
}

// get the skin/bundle name in a language
export const l = (names, interaction) => {
    let valLocale;

    if(!config.localiseSkinNames) valLocale = DEFAULT_VALORANT_LANG;

    else if(typeof interaction === 'string') valLocale = discToValLang[interaction];
    else if(interaction) {
        const userLang = getSetting(interaction.user.id, 'locale');
        if(userLang !== "Automatic") valLocale = discToValLang[userLang];
    }
    if(!valLocale && interaction && interaction.locale) valLocale = discToValLang[interaction.locale];
    if(!valLocale) valLocale = DEFAULT_VALORANT_LANG;

    return names[valLocale];
}

const hideUsername = (args, interactionOrId) => {
    if(!args.u) return {...args, u: s(interactionOrId).info.NO_USERNAME};
    if(!interactionOrId) return args;

    const id = typeof interactionOrId === 'string' ? interactionOrId : interactionOrId.user.id;
    const hide = getSetting(id, 'hideIgn');
    if(!hide) return args;

    return {...args, u: `||*${s(interactionOrId).info.HIDDEN_USERNAME}*||`};
}
