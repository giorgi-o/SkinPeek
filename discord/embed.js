import {getBundle, getSkin} from "../valorant/cache.js";
import {
    emojiToString,
    skinNameAndEmoji,
    escapeMarkdown,
    itemTypes
} from "../misc/util.js";
import config from "../misc/config.js";


export const VAL_COLOR_1 = 0xFD4553;
export const VAL_COLOR_2 = 0x202225;
export const VAL_COLOR_3 = 0xEAEEB2;

const thumbnails = [
    "https://media.valorant-api.com/sprays/290565e7-4540-5764-31da-758846dc2a5a/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/31ba7f82-4fcb-4cbb-a719-06a3beef8603/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/fef66645-4e35-ff38-1b7c-799dd5fc7468/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/02f4c1db-46bb-a572-e830-0886edbb0981/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/40222bb5-4fce-9320-f4f1-95861df83c47/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/a7e1a9b6-4ab5-e6f7-e5fe-bc86f87b44ee/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/09786b0a-4c3e-5ba8-46ab-c49255620a5f/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/7b0e0c8d-4f91-2a76-19b9-079def2fa843/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/ea087a08-4b9f-bd0d-15a5-d3ba09c4c381/fulltransparenticon.png",
    "https://media.valorant-api.com/sprays/40ff9251-4c11-b729-1f27-088ee032e7ce/fulltransparenticon.png"
];

export const MAINTENANCE_MESSAGE = "**Valorant servers are currently down for maintenance!** Try again later.";

export const authFailureMessage = (interaction, authResponse, message, hideEmail=false) => {
    let embed;

    if(authResponse.maintenance) embed = basicEmbed(MAINTENANCE_MESSAGE);
    else if(authResponse.mfa) {
        console.log(`${interaction.user.tag} needs 2FA code`);
        if(authResponse.method === "email") {
            if(hideEmail) embed = basicEmbed(`**Riot sent a code to your email address!** Use \`/2fa\` to complete your login.`);
            else embed = basicEmbed(`**Riot sent a code to ${escapeMarkdown(authResponse.email)}!** Use \`/2fa\` to complete your login.`);
        }
        else embed = basicEmbed("**You have 2FA enabled!** use `/2fa` to enter your code.");
    }
    else if(authResponse.rateLimit) {
        console.log(`${interaction.user.tag} got rate-limited`);
        embed = basicEmbed("**Too many people are logging in at the same time**, and Riot is not happy!\nPlease try again later.");
    }
    else embed = basicEmbed(message);

    return {
        embeds: [embed],
        ephemeral: true
    }
}

export const skinChosenEmbed = async (skin, channel) => {
    let  description = `Successfully set an alert for the **${await skinNameAndEmoji(skin, channel)}**!`;
    if(!skin.rarity) description += "\n***Note:** This is a battlepass skin, it's not gonna appear in your shop!*";
    return {
        description: description,
        color: VAL_COLOR_1,
        thumbnail: {
            url: skin.icon
        }
    }
}

export const renderOffers = async (shop, interaction, valorantUser, VPemoji) => {
    if(!shop.success) return authFailureMessage(interaction, shop, "**Could not fetch your shop**, most likely you got logged out. Try logging in again.");

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
    if(!bundles.success) return authFailureMessage(interaction, bundles, "**Could not fetch your bundles**, most likely you got logged out. Try logging in again.");

    bundles = bundles.bundles;

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
            description: `${subName}${slantedDescription}${emojiString} **${bundle.data.price}** ~~${bundle.data.basePrice}~~\nExpires <t:${bundle.data.expires}:R>`,
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
        title: `${bundle.name} Collection`,
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

export const renderNightMarket = async (market, interaction, valorantUser, emoji) => {
    if(!market.success) return authFailureMessage(interaction, market, "**Could not fetch your Night Market**, most likely you got logged out. Try logging in again.");

    if(!market.offers) return {embeds: [basicEmbed("**There is no Night Market currently! Look out for April 7th!**")]};

    const embeds = [{
        description: `Night.Market for **${valorantUser.username}** (ends <t:${market.expires}:R>)`,
        color: VAL_COLOR_3
    }];

    const emojiString = emojiToString(emoji) || "Price:";
    const VP_UUID = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";

    for(const offer of market.offers) {
        const skin = await getSkin(offer.Offer.OfferID);

        const embed = await skinEmbed(skin, skin.price, interaction, emojiString);
        embed.description = `${emojiString} **${offer.DiscountCosts[VP_UUID]}**\n${emojiString} ~~${offer.Offer.Cost[VP_UUID]}~~ (-${offer.DiscountPercent}%)`;

        embeds.push(embed);
    }

    return {embeds};
}

export const renderBattlepass = async (battlepass, targetlevel, interaction, valorantUser) => {
    if(!battlepass.success) return authFailureMessage(interaction, battlepass, "**Could not fetch your battlepass progression**, most likely you got logged out. Try logging in again.");

    const embeds = [{
        title: `📈 Battlepass Calculation`,
        thumbnail: {url: thumbnails[Math.floor(Math.random()*thumbnails.length)]},
        description: `**${valorantUser.username}**'s battlepass tier:\n${createProgressBar(battlepass.xpneeded, battlepass.bpdata.progressionTowardsNextLevel, battlepass.bpdata.progressionLevelReached)}`,
        color: VAL_COLOR_1,
        fields: [
            {
                "name": "General",
                "value": `Total XP\nLevel up\nTier ${targetlevel}\nWeekly XP left`,
                "inline": true
            },
            {
                "name": "XP",
                "value": `\`${battlepass.totalxp}\`\n\`${battlepass.xpneeded}\`\n\`${battlepass.totalxpneeded}\`\n\`${battlepass.weeklyxp}\``,
                "inline": true
            }
        ],
        footer: {
            text: (battlepass.battlepassPurchased) ? valorantUser.username + " purchased the battlepass!" : ""
        }
    },
    {
        title: "🔫 Number of games needed",
        color: VAL_COLOR_1,
        fields: [
            {
                "name": "Gamemode",
                "value": "Spikerush\nUnrated/Competitive\n",
                "inline": true
            },
            {
                "name": "#",
                "value": `\`${battlepass.spikerushneeded}\`\n\`${battlepass.normalneeded}\``,
                "inline": true
            },
            {
                "name": "incl. weeklies",
                "value": `\`${battlepass.spikerushneededwithweeklies}\`\n\`${battlepass.normalneededwithweeklies}\``,
                "inline": true
            }
        ],
        footer: {
            text: `Act ends in ${battlepass.season_days_left} days`
        }
    },
    {
        title: "📅 XP needed",
        color: VAL_COLOR_1,
        fields: [
            {
                "name": "Average",
                "value": "Daily XP\nWeekly XP",
                "inline": true
            },
            {
                "name": "XP",
                "value": `\`${battlepass.dailyxpneeded}\`\n\`${battlepass.weeklyxpneeded}\``,
                "inline": true
            },
            {
                "name": "incl. weeklies",
                "value": `\`${battlepass.dailyxpneededwithweeklies}\`\n\`${battlepass.weeklyxpneededwithweeklies}\``,
                "inline": true
            }
        ]
    }];

    return {embeds};
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
            embed.description = `${VPemojiString} **${item.price || "Free"}** ~~${item.basePrice}~~`;
            if(item.type === itemTypes.TITLE) embed.description = "`" + item.item.text + "`\n\n" + embed.description
        }

        embeds.push(embed);
    }

    // discord has a limit of 10 embeds (9 if we count the bundle title)
    if(embeds.length > 9) {
        embeds.length = 8;
        embeds.push(basicEmbed(`...and **${items.length - 9}** more items`));
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
        url: config.linkItemImage ? skin.icon : null,
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
        url: config.linkItemImage ? buddy.icon : null,
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
        url: config.linkItemImage ? card.icons.large : null,
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
        url: config.linkItemImage ? spray.icon : null,
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
        description: "`" + title.text + "`\n\n" + (priceDescription(VPemojiString, price) || ""),
        color: VAL_COLOR_2,
    }
}

export const botInfoEmbed = (client, guildCount, userCount, registeredUserCount, ownerString, status) => {
    const fields = [
        {
            name: "Servers",
            value: guildCount.toString(),
            inline: true
        },
        {
            name: "Members",
            value: userCount.toString(),
            inline: true
        },
        {
            name: "Registered",
            value: registeredUserCount.toString(),
            inline: true
        },
        {
            name: ":dog:",
            value: "woof",
            inline: true
        }
    ];
    if(ownerString) fields.push({
        name: "Owner",
        value: ownerString,
        inline: true
    });
    if(status) fields.push({
        name: "Status",
        value: status,
        inline: true
    });

    const readyTimestamp = Math.round(client.readyTimestamp / 1000);

    return {
        embeds: [{
            title: ":pencil: Stats",
            description: `Started running on <t:${readyTimestamp}:f> (<t:${readyTimestamp}:R>)`,
            color: VAL_COLOR_3,
            fields: fields
        }]
    }
}

export const ownerMessageEmbed = (messageContent, author) => {
    return {
        title: "Message from bot owner:",
        description: messageContent,
        color: VAL_COLOR_3,
        footer: {
            text: "By " + author.username,
            icon_url: author.displayAvatarURL()
        }
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

const createProgressBar = (totalxpneeded, currentxp, level) => {
    const length = 14;
    const totalxp = Number(totalxpneeded.replace(',', '')) + Number(currentxp)

    const index = Math.min(Math.round(currentxp / totalxp * length), length);

    const line = '▬';
    const circle = '⬤';

    const bar = line.repeat(Math.max(index, 0)) + circle + line.repeat(Math.max(length - index, 0));

    return level + '┃' + bar + '┃' + (Number(level) + 1);
}
