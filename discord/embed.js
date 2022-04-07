import {getBundle, getSkin} from "../valorant/cache.js";
import {
    emojiToString,
    skinNameAndEmoji,
    escapeMarkdown,
    itemTypes
} from "../misc/util.js";
import config from "../misc/config.js";
import {s} from "../misc/languages.js";


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

export const authFailureMessage = (interaction, authResponse, message, hideEmail=false) => {
    let embed;

    if(authResponse.maintenance) embed = basicEmbed(s(interaction).error.MAINTENANCE);
    else if(authResponse.mfa) {
        console.log(`${interaction.user.tag} needs 2FA code`);
        if(authResponse.method === "email") {
            if(hideEmail) embed = basicEmbed(s(interaction).info.MFA_EMAIL_HIDDEN);
            else embed = basicEmbed(s(interaction).info.MFA_EMAIL.f({e: escapeMarkdown(authResponse.email)}));
        }
        else embed = basicEmbed(s(interaction).info.MFA_GENERIC);
    }
    else if(authResponse.rateLimit) {
        console.log(`${interaction.user.tag} got rate-limited`);
        embed = basicEmbed(s(interaction).error.RATE_LIMIT);
    }
    else embed = basicEmbed(message);

    return {
        embeds: [embed],
        ephemeral: true
    }
}

export const skinChosenEmbed = async (interaction, skin) => {
    const channel = interaction.channel || await client.channels.fetch(interaction.channelId);
    let description = s(interaction).info.ALERT_SET.f({s: await skinNameAndEmoji(skin, channel)});
    if(!skin.rarity) description += s(interaction).info.ALERT_BP_SKIN;
    return {
        description: description,
        color: VAL_COLOR_1,
        thumbnail: {
            url: skin.icon
        }
    }
}

export const renderOffers = async (shop, interaction, valorantUser, VPemoji) => {
    if(!shop.success) return authFailureMessage(interaction, shop, s(interaction).error.AUTH_ERROR_SHOP);

    const embeds = [basicEmbed(s(interaction).info.SHOP_HEADER.f({u: valorantUser.username, t: shop.expires}))];

    const emojiString = emojiToString(VPemoji) || s(interaction).info.PRICE;

    for(const uuid of shop.offers) {
        const skin = await getSkin(uuid);
        const embed = await skinEmbed(skin, skin.price, interaction, emojiString);
        embeds.push(embed);
    }

    return {embeds};
}

export const renderBundles = async (bundles, interaction, VPemoji) => {
    if(!bundles.success) return authFailureMessage(interaction, bundles, s(interaction).error.AUTH_ERROR_BUNLES);

    bundles = bundles.bundles;

    if(bundles.length === 1) {
        const bundle = await getBundle(bundles[0].uuid);

        const renderedBundle = await renderBundle(bundle, interaction, VPemoji, false);
        const titleEmbed = renderedBundle.embeds[0];
        titleEmbed.title = s(interaction).info.BUNDLE_HEADER.f({b: titleEmbed.title});
        titleEmbed.description += ` *(${s(interaction).info.EXPIRES.f({t: bundle.data.expires})})*`;

        return renderedBundle;
    }

    const emojiString = emojiToString(VPemoji) || s(interaction).info.PRICE;

    const embeds = [{
        title: s(interaction).info.BUNDLES_HEADER,
        description: s(interaction).info.BUNDLES_HEADER_DESC,
        color: VAL_COLOR_1
    }];

    for(const bundleData of bundles) {
        const bundle = await getBundle(bundles[0].uuid);

        const subName = bundle.subName ? bundle.subName + "\n" : "";
        const slantedDescription = bundle.description ? "*" + bundle.description + "*\n" : "";
        const embed = {
            title: s(interaction).info.BUNDLE_NAME.f({b: bundle.name}),
            description: `${subName}${slantedDescription}${emojiString} **${bundle.data.price}** ~~${bundle.data.basePrice}~~ ${s(interaction).info.EXPIRES.f({t:bundle.data.expires})}`,
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
        title: s(interaction).info.BUNDLE_NAME.f({b: bundle.name}),
        description: `${subName}${slantedDescription}`,
        color: VAL_COLOR_1,
        image: {
            url: bundle.icon
        },
        footer: {
            text: s(interaction).info.NO_BUNDLE_DATA
        }
    }]};

    const emojiString = emoji ? emojiToString(emoji) : s(interaction).info.PRICE;
    const bundleTitleEmbed = {
        title: s(interaction).info.BUNDLE_NAME.f({b: bundle.name}),
        description: `${subName}${slantedDescription}${emojiString} ~~${bundle.data.basePrice}~~ **${bundle.data.price}**`,
        color: VAL_COLOR_3,
        image: {
            url: bundle.icon
        }
    }

    if(includeExpires) bundleTitleEmbed.description += ` (${(bundle.data.expires > Date.now() / 1000 ? 
        s(interaction).info.EXPIRES : s(interaction).info.EXPIRED).f({t: bundle.data.expires})})`;

    const itemEmbeds = await renderBundleItems(bundle, interaction, emoji);
    return {
        embeds: [bundleTitleEmbed, ...itemEmbeds]
    }
}

export const renderNightMarket = async (market, interaction, valorantUser, emoji) => {
    if(!market.success) return authFailureMessage(interaction, market, s(interaction).error.AUTH_ERROR_NMARKET);

    if(!market.offers) return {embeds: [basicEmbed(s(interaction).error.NO_NMARKET)]};

    const embeds = [{
        description: s(interaction).info.NMARKET_HEADER.f({u: valorantUser.username, t: market.expires}),
        color: VAL_COLOR_3
    }];

    const emojiString = emojiToString(emoji) || s(interaction).info.PRICE;
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
    if(!battlepass.success) return authFailureMessage(interaction, battlepass, s(interaction).error.AUTH_ERROR_BPASS);

    const embeds = [{
        title: s(interaction).battlepass.CALCULATIONS_TITLE,
        thumbnail: {url: thumbnails[Math.floor(Math.random()*thumbnails.length)]},
        description: `${s(interaction).battlepass.TIER_HEADER.f({u: valorantUser.username})}\n${createProgressBar(battlepass.xpneeded, battlepass.bpdata.progressionTowardsNextLevel, battlepass.bpdata.progressionLevelReached)}`,
        color: VAL_COLOR_1,
        fields: [
            {
                "name": s(interaction).battlepass.GENERAL_COL,
                "value": `${s(interaction).battlepass.TOTAL_ROW}\n${s(interaction).battlepass.LVLUP_ROW}\n${s(interaction).battlepass.TIER50_ROW.f({t: targetlevel})}\n${s(interaction).battlepass.WEEKLY_LEFT_ROW}`,
                "inline": true
            },
            {
                "name": s(interaction).battlepass.XP_COL,
                "value": `\`${battlepass.totalxp}\`\n\`${battlepass.xpneeded}\`\n\`${battlepass.totalxpneeded}\`\n\`${battlepass.weeklyxp}\``,
                "inline": true
            }
        ],
        footer: {
            text: battlepass.battlepassPurchased ? s(interaction).battlepass.BP_PURCHASED.f({u: valorantUser.username}) : ""
        }
    },
    {
        title: s(interaction).battlepass.GAMES_HEADER,
        color: VAL_COLOR_1,
        fields: [
            {
                "name": s(interaction).battlepass.GAMEMODE_COL,
                "value": `${s(interaction).battlepass.SPIKERUSH_ROW}\n${s(interaction).battlepass.NORMAL_ROW}\n`,
                "inline": true
            },
            {
                "name": "#",
                "value": `\`${battlepass.spikerushneeded}\`\n\`${battlepass.normalneeded}\``,
                "inline": true
            },
            {
                "name": s(interaction).battlepass.INCL_WEEKLIES_COL,
                "value": `\`${battlepass.spikerushneededwithweeklies}\`\n\`${battlepass.normalneededwithweeklies}\``,
                "inline": true
            }
        ],
        footer: {
            text: s(interaction).battlepass.ACT_END.f({d: battlepass.season_days_left})
        }
    },
    {
        title: s(interaction).battlepass.XP_HEADER,
        color: VAL_COLOR_1,
        fields: [
            {
                "name": s(interaction).battlepass.AVERAGE_COL,
                "value": `${s(interaction).battlepass.DAILY_XP_ROW}\n${s(interaction).battlepass.WEEKLY_XP_ROW}`,
                "inline": true
            },
            {
                "name": s(interaction).battlepass.XP_COL,
                "value": `\`${battlepass.dailyxpneeded}\`\n\`${battlepass.weeklyxpneeded}\``,
                "inline": true
            },
            {
                "name": s(interaction).battlepass.INCL_WEEKLIES_COL,
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
            embed.description = `${VPemojiString} **${item.price || s(interaction).battlepass.FREE}** ~~${item.basePrice}~~`;
            if(item.type === itemTypes.TITLE) embed.description = "`" + item.item.text + "`\n\n" + embed.description
        }

        embeds.push(embed);
    }

    // discord has a limit of 10 embeds (9 if we count the bundle title)
    if(embeds.length > 9) {
        embeds.length = 8; // should this be 9?
        embeds.push(basicEmbed(s(interaction).info.MORE_ITEMS.f({n: items.length - 9})));
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
        default: return basicEmbed(s(interaction).error.UNKNOWN_ITEM_TYPE.f({t: item.type}));
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

export const botInfoEmbed = (interaction, client, guildCount, userCount, registeredUserCount, ownerString, status) => {
    const fields = [
        {
            name: s(interaction).info.INFO_SERVERS,
            value: guildCount.toString(),
            inline: true
        },
        {
            name: s(interaction).info.INFO_MEMBERS,
            value: userCount.toString(),
            inline: true
        },
        {
            name: s(interaction).info.INFO_REGISTERED,
            value: registeredUserCount.toString(),
            inline: true
        },
        {
            name: ":service_dog:",
            value: s(interaction).info.INFO_WOOF,
            inline: true
        }
    ];
    if(ownerString) fields.push({
        name: s(interaction).info.INFO_OWNER,
        value: ownerString,
        inline: true
    });
    if(status) fields.push({
        name: s(interaction).info.INFO_STATUS,
        value: status,
        inline: true
    });

    const readyTimestamp = Math.round(client.readyTimestamp / 1000);

    return {
        embeds: [{
            title: ":pencil: Stats",
            description: s(interaction).info.INFO_RUNNING.f({t1: readyTimestamp, t2: readyTimestamp}),
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
