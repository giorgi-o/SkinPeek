import {getBundle, getSkin} from "../valorant/cache.js";
import {
    emojiToString,
    skinNameAndEmoji,
    MAINTENANCE, itemTypes,
} from "../misc/util.js";


export const VAL_COLOR_1 = 0xFD4553;
export const VAL_COLOR_2 = 0x0F1923;
export const VAL_COLOR_3 = 0xEAEEB2;

export const MAINTENANCE_MESSAGE = "**Valorant servers are currently down for maintenance!** Try again later.";

export const skinChosenEmbed = async (skin, channel) => {
    let  description = `Successfully set an alert for the **${await skinNameAndEmoji(skin, channel)}**!`;
    if(!skin.rarity) description += "\n***Note:** This is a battle pass skin!*";
    return {
        description: description,
        color: VAL_COLOR_1,
        thumbnail: {
            url: skin.icon
        }
    }
}

export const renderOffers = async (shop, interaction, valorantUser, VPemoji) => {
    if(!shop) return {
        embeds: [basicEmbed("**Could not fetch your shop**, most likely you got logged out. Try logging in again.")],
        ephemeral: true
    };

    if(shop === MAINTENANCE) return {
        embeds: [basicEmbed(MAINTENANCE_MESSAGE)],
        ephemeral: true
    };

    const embeds = [basicEmbed(`Daily shop for **${valorantUser.username}** (new shop <t:${shop.expires}:R>)`)];

    const emojiString = emojiToString(VPemoji) || "Price:";

    for(const uuid of shop.offers) {
        const skin = await getSkin(uuid);
        const embed = await skinEmbed(skin, skin.price, interaction, emojiString);
        embeds.push(embed);
    }

    return {embeds};
}

export const renderBundles = async (bundles, interaction, VPemoji) => {
    if(!bundles) return {
        embeds: [basicEmbed("**Could not fetch your bundles**, most likely you got logged out. Try logging in again.")],
        ephemeral: true
    };

    if(bundles === MAINTENANCE) return {
        embeds: [basicEmbed(MAINTENANCE_MESSAGE)],
        ephemeral: true
    };

    if(bundles.length === 1) {
        const bundle = await getBundle(bundles[0].uuid);

        const renderedBundle = await renderBundle(bundle, interaction, VPemoji, false);
        const titleEmbed = renderedBundle.embeds[0];
        titleEmbed.title = "Featured bundle: **" + titleEmbed.title + `** *(expires <t:${bundle.data.expires}:R>)*`;

        return renderedBundle;
    }

    const emojiString = emojiToString(VPemoji) || "Price:";

    const embeds = [{
        title: "Currently featured bundles:",
        description: "Use `/bundle` to inspect a specific bundle",
        color: VAL_COLOR_1
    }];

    for(const bundleData of bundles) {
        const bundle = await getBundle(bundles[0].uuid);

        const subName = bundle.subName ? bundle.subName + "\n" : "";
        const slantedDescription = bundle.description ? "*" + bundle.description + "*\n" : "";
        const embed = {
            title: bundle.name + " Collection",
            description: `${subName}${slantedDescription}${emojiString} ~~${bundle.data.basePrice}~~ **${bundle.data.price}**\nExpires <t:${bundle.data.expires}:R>`,
            color: VAL_COLOR_2,
            thumbnail: {
                url: bundle.icon
            }
        };
        embeds.push(embed);
    }

    return {embeds};
}

export const renderBundle = async (bundle, interaction, emoji, includeExpires=true) => {
    const subName = bundle.subName ? bundle.subName + "\n" : "";
    const slantedDescription = bundle.description ? "*" + bundle.description + "*\n" : "";

    if(!bundle.data) return {embeds: [{
        title: `${bundle.name} collection`,
        description: `${subName}${slantedDescription}`,
        color: VAL_COLOR_1,
        image: {
            url: bundle.icon
        },
        footer: {
            text: "Riot doesn't provide data for previous/unreleased bundles :("
        }
    }]};

    const emojiString = emoji ? emojiToString(emoji) : "Price:";
    const bundleTitleEmbed = {
        title: `${bundle.name} Collection`,
        description: `${subName}${slantedDescription}${emojiString} ~~${bundle.data.basePrice}~~ **${bundle.data.price}**`,
        color: VAL_COLOR_3,
        image: {
            url: bundle.icon
        }
    }

    if(includeExpires) bundleTitleEmbed.description += ` (${bundle.data.expires > Date.now() / 1000 ? "expires" : "expired"} <t:${bundle.data.expires}:R>)`

    const itemEmbeds = await renderBundleItems(bundle, interaction, emoji);
    return {
        embeds: [bundleTitleEmbed, ...itemEmbeds]
    }
}

const renderBundleItems = async (bundle, interaction, VPemojiString) => {
    if(!bundle.data) return [];

    const priorities = {};
    priorities[itemTypes.SKIN] = 5;
    priorities[itemTypes.BUDDY] = 4;
    priorities[itemTypes.SPRAY] = 3;
    priorities[itemTypes.CARD] = 2;
    priorities[itemTypes.TITLE] = 1;

    const items = bundle.data.items.sort((a, b) => priorities[b.type] - priorities[a.type]);

    const embeds = [];
    for(const item of items) {
        const embed = await bundleItemEmbed(item, interaction, VPemojiString);

        if(item.amount !== 1) embed.title = `${item.amount}x ${embed.title}`
        if(item.type === itemTypes.SKIN) embed.color = VAL_COLOR_1;
        if(item.price !== item.basePrice) {
            embed.description = `${VPemojiString} ~~${item.basePrice}~~ **${item.price || "Free"}**`;
            if(item.type === itemTypes.TITLE) embed.description = "`" + item.item.text + "`\n\n" + embed.description
        }

        embeds.push(embed);
    }
    return embeds;
}

const bundleItemEmbed = async (item, interaction, VPemojiString) => {
    switch(item.type) {
        case itemTypes.SKIN: return skinEmbed(item.item, item.price, interaction, VPemojiString);
        case itemTypes.BUDDY: return buddyEmbed(item.item, item.price, VPemojiString);
        case itemTypes.CARD: return cardEmbed(item.item, item.price, VPemojiString);
        case itemTypes.SPRAY: return sprayEmbed(item.item, item.price, VPemojiString);
        case itemTypes.TITLE: return titleEmbed(item.item, item.price, VPemojiString);
        default: return basicEmbed("**Unknown item type!** `" + item.type + "`");
    }
}

const skinEmbed = async (skin, price, interaction, VPemojiString) => {
    return {
        title: await skinNameAndEmoji(skin, interaction.channel),
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: skin.icon
        }
    };
}

const buddyEmbed = async (buddy, price, VPemojiString) => {
    return {
        title: buddy.name,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: buddy.icon
        }
    }
}

const cardEmbed = async (card, price, VPemojiString) => {
    return {
        title: card.name,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: card.icons.large
        }
    }
}

const sprayEmbed = async (spray, price, VPemojiString) => {
    return {
        title: spray.name,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: spray.icon
        }
    }
}

const titleEmbed = async (title, price, VPemojiString) => {
    return {
        title: title.name,
        description: "`" + title.text + "`\n\n" + (priceDescription(VPemojiString, price) || ""), // try ```
        color: VAL_COLOR_2,
    }
}

const priceDescription = (VPemojiString, price) => {
    if(price) return `${VPemojiString} ${price}`;
}

export const basicEmbed = (content) => {
    return {
        description: content,
        color: VAL_COLOR_1
    }
}

export const secondaryEmbed = (content) => {
    return {
        description: content,
        color: VAL_COLOR_2
    }
}