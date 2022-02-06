import {asyncReadFile} from "../misc/util.js";

const VPEmojiName = "ValPointsIcon";
const VPEmojiFilename = "assets/vp.png"; // https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/largeicon.png

const RadEmojiName = "RadianiteIcon";
const RadEmojiFilename = "assets/rad.png"; // https://media.valorant-api.com/currencies/e59aa87c-4cbf-517a-5983-6e81511be9b7/displayicon.png

export const VPEmoji = async (guild, externalEmojisAllowed=false) => await getOrCreateEmoji(guild, VPEmojiName, VPEmojiFilename, externalEmojisAllowed);
export const RadEmoji = async (guild, externalEmojisAllowed=false) => await getOrCreateEmoji(guild, RadEmojiName, RadEmojiFilename, externalEmojisAllowed);

export const rarityEmoji = async (guild, name, icon, externalEmojisAllowed=false) => await getOrCreateEmoji(guild, `${name}Rarity`, icon, externalEmojisAllowed);

const getOrCreateEmoji = async (guild, name, filenameOrUrl, externalEmojisAllowed) => {
    if(!guild || !name || !filenameOrUrl) return;

    // see if emoji exists already
    const emoji = emojiInGuild(guild, name);
    if(emoji) return emoji;

    // check in other guilds
    if(externalEmojisAllowed) {
        for(const otherGuild of guild.client.guilds.cache.values()) {
            const emoji = emojiInGuild(otherGuild, name);
            if(emoji) return emoji;
        }
    }

    return await createEmoji(guild, name, filenameOrUrl);
}

const emojiInGuild = (guild, name) => {
    return guild.emojis.cache.find(emoji => emoji.name === name);
}

const createEmoji = async (guild, name, filenameOrUrl) => {
    console.debug(`Uploading emoji ${name} in ${guild.name}...`);
    try {
        return await guild.emojis.create(await resolveFilenameOrUrl(filenameOrUrl), name);
    } catch(e) {
        console.error(`Could not create ${name} emoji! Either I don't have the right role or there are no more emoji slots`);
        console.error(`${e.name}: ${e.message}`);
    }
}

const resolveFilenameOrUrl = async (filenameOrUrl) => {
    if(filenameOrUrl.startsWith("http"))
        return filenameOrUrl;
    return await asyncReadFile(filenameOrUrl);
}
