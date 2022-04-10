import fs from "fs";

const languages = {};

const importLanguage = (language) => {
    try {
        languages[language] = JSON.parse(fs.readFileSync(`./languages/${language}.json`, 'utf-8'));
    } catch (e) {}
}
importLanguage('en-GB');

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
