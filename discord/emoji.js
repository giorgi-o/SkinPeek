import {asyncReadFile, canCreateEmojis} from "../misc/util.js";
import config from "../misc/config.js";

const VPEmojiName = "ValPointsIcon";
const VPEmojiFilename = "assets/vp.png"; // https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/largeicon.png

const RadEmojiName = "RadianiteIcon";
const RadEmojiFilename = "assets/rad.png"; // https://media.valorant-api.com/currencies/e59aa87c-4cbf-517a-5983-6e81511be9b7/displayicon.png

// the timestamp of the last time the emoji cache was updated for each guild
const lastEmojiFetch = {};

export const VPEmoji = async (channel, externalEmojisAllowed=false) => await getOrCreateEmoji(channel, VPEmojiName, VPEmojiFilename, externalEmojisAllowed);
export const RadEmoji = async (channel, externalEmojisAllowed=false) => await getOrCreateEmoji(channel, RadEmojiName, RadEmojiFilename, externalEmojisAllowed);

export const rarityEmoji = async (channel, name, icon, externalEmojisAllowed=false) => await getOrCreateEmoji(channel, `${name}Rarity`, icon, externalEmojisAllowed);

const getOrCreateEmoji = async (channel, name, filenameOrUrl, externalEmojisAllowed) => {
    if(!name || !filenameOrUrl) return;

    const guild = channel.guild;

    // see if emoji exists already
    const emoji = emojiInGuild(guild, name);
    if(emoji && emoji.available) return emoji;

    // check in other guilds
    if(externalEmojisAllowed) {
        if(config.useEmojisFromServer) {
            const emojiGuild = await channel.client.guilds.fetch(config.useEmojisFromServer);
            if(!emojiGuild) console.error("useEmojisFromServer server not found! Either the ID is incorrect or I am not in that server anymore!");
            else {
                await updateEmojiCache(emojiGuild);
                const emoji = emojiInGuild(emojiGuild, name);
                if(emoji && emoji.available) return emoji;
            }
        }

        for(const otherGuild of channel.client.guilds.cache.values()) {
            const emoji = emojiInGuild(otherGuild, name);
            if(emoji && emoji.available) return emoji;
        }
    }

    // couldn't find usable emoji, create it
    if(guild) return await createEmoji(guild, name, filenameOrUrl);
}

const emojiInGuild = (guild, name) => {
    return guild && guild.emojis.cache.find(emoji => emoji.name === name);
}

const createEmoji = async (guild, name, filenameOrUrl) => {
    if(!guild || !name || !filenameOrUrl) return;
    if(!canCreateEmojis(guild)) return console.debug(`Don't have permission to create emoji ${name} in guild ${guild.name}!`);

    await updateEmojiCache(guild);
    if(guild.emojis.cache.size >= maxEmojis(guild))
        return console.debug(`Emoji limit of ${maxEmojis(guild)} reached for ${guild.name} while uploading ${name}!`);

    console.debug(`Uploading emoji ${name} in ${guild.name}...`);
    try {
        return await guild.emojis.create(await resolveFilenameOrUrl(filenameOrUrl), name);
    } catch(e) {
        console.error(`Could not create ${name} emoji in ${guild.name}! Either I don't have the right role or there are no more emoji slots`);
        console.error(`${e.name}: ${e.message}`);
    }
}

const resolveFilenameOrUrl = async (filenameOrUrl) => {
    if(filenameOrUrl.startsWith("http"))
        return filenameOrUrl;
    return await asyncReadFile(filenameOrUrl);
}

const updateEmojiCache = async (guild) => {
    if(!guild) return;
    if(!lastEmojiFetch[guild.id]) lastEmojiFetch[guild.id] = 0;
    if(Date.now() - lastEmojiFetch[guild.id] < config.emojiCacheExpiration) return; // don't update emoji cache multiple times per second

    await guild.emojis.fetch();

    lastEmojiFetch[guild.id] = Date.now();
    console.debug(`Updated emoji cache for ${guild.name}`);
}

const maxEmojis = (guild) => {
    switch(guild.premiumTier) {
        case "NONE": return 50;
        case "TIER_1": return 100;
        case "TIER_2": return 150;
        case "TIER_3": return 250;
    }
}
