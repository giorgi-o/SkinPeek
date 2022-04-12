import fs from "fs";

const languages = {};
const DEFAULT_LANG = 'en-GB';

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

    languages[language] = languageHandler;
}
importLanguage(DEFAULT_LANG);

export const s = (interaction) => {
    if(!interaction || !interaction.locale) return languages['en-GB'];
    const lang = interaction.locale;
    if(!languages[lang]) importLanguage(lang);
    return languages[lang] || languages['en-GB'];
}

String.prototype.f = function(args) {
    let str = this;
    for(let i in args)
        str = str.replace(`{${i}}`, args[i]);
    return str;
}
