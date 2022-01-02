import {asyncReadFile} from "./Valorant/util.js";

const emojiName = "ValPointsIcon";
const emojiFilename = "vp.png"; // https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/largeicon.png

export const VPEmojiString = async (guild) => {
    // see if emoji exists already
    const emoji = emojiInGuild(guild);
    if(emoji) return emoji;

    // check in other guilds
    for(const otherGuild of guild.client.guilds.cache.values()) {
        const emoji = emojiInGuild(otherGuild);
        if(emoji) return emoji;
    }

    return await createEmoji(guild);
}

const emojiInGuild = (guild) => {
    return guild.emojis.cache.find(emoji => emoji.name === emojiName);
}

const createEmoji = async (guild) => {
    try {
        return await guild.emojis.create(await asyncReadFile(emojiFilename), emojiName);
    } catch(e) {
        console.error("Could not create VP emoji! Either I don't have the right role or there are no more emoji slots");
        console.error(e);
    }
}