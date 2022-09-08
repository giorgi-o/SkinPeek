import {
    getBuddy,
    getBundle,
    getCard,
    getSkin,
    getSkinFromSkinUuid,
    getSpray,
    getTitle,
    getWeapon
} from "../valorant/cache.js";
import {
    skinNameAndEmoji,
    escapeMarkdown,
    itemTypes,
    removeAlertActionRow,
    removeAlertButton,
    fetchChannel
} from "../misc/util.js";
import config from "../misc/config.js";
import {DEFAULT_VALORANT_LANG, discToValLang, l, s} from "../misc/languages.js";
import {MessageActionRow, MessageButton} from "discord.js";
import {getStatsFor} from "../misc/stats.js";
import {getUser} from "../valorant/auth.js";
import {readUserJson, removeDupeAccounts, saveUser} from "../valorant/accountSwitcher.js";
import {getSetting, humanifyValue, settingName} from "../misc/settings.js";
import {VPEmoji} from "./emoji.js";


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

export const authFailureMessage = (interaction, authResponse, message="AUTH_ERROR", isEphemeral=false) => {
    let embed;

    if(authResponse.maintenance) embed = basicEmbed(s(interaction).error.MAINTENANCE);
    else if(authResponse.mfa) {
        console.log(`${interaction.user.tag} needs 2FA code`);
        if(authResponse.method === "email") {
            if(isEphemeral) embed = basicEmbed(s(interaction).info.MFA_EMAIL.f({e: escapeMarkdown(authResponse.email)}));
            else embed = basicEmbed(s(interaction).info.MFA_EMAIL_HIDDEN);
        }
        else embed = basicEmbed(s(interaction).info.MFA_GENERIC);
    }
    else if(authResponse.rateLimit) {
        console.log(`${interaction.user.tag} got rate-limited`);
        if(typeof authResponse.rateLimit === "number") embed = basicEmbed(s(interaction).error.LOGIN_RATELIMIT_UNTIL.f({t: Math.ceil(authResponse.rateLimit / 1000)}));
        else embed = basicEmbed(s(interaction).error.LOGIN_RATELIMIT);
    }
    else {
        embed = basicEmbed(message);

        // two-strike system
        const user = getUser(interaction.user.id);
        if(user) {
            user.authFailures++;
            saveUser(user);
        }
    }

    return {
        embeds: [embed],
        ephemeral: true
    }
}

export const skinChosenEmbed = async (interaction, skin) => {
    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    let description = s(interaction).info.ALERT_SET.f({s: await skinNameAndEmoji(skin, channel, interaction.locale)});
    if(config.fetchSkinPrices && !skin.price) description += s(interaction).info.ALERT_BP_SKIN;
    return {
        description: description,
        color: VAL_COLOR_1,
        thumbnail: {
            url: skin.icon
        }
    }
}

export const renderOffers = async (shop, interaction, valorantUser, VPemoji, otherId=null) => {
    const forOtherUser = otherId && otherId !== interaction.user.id;
    const otherUserMention = `<@${otherId}>`;

    if(!shop.success) {
        let errorText;

        if(forOtherUser) errorText = s(interaction).error.AUTH_ERROR_SHOP_OTHER.f({u: otherUserMention});
        else errorText = s(interaction).error.AUTH_ERROR_SHOP;

        return authFailureMessage(interaction, shop, errorText);
    }

    let headerText;
    if(forOtherUser) {
        const json = readUserJson(otherId);

        let usernameText = otherUserMention;
        if(json.accounts.length > 1) usernameText += ' ' + s(interaction).info.SWITCH_ACCOUNT_BUTTON.f({n: json.currentAccount});

        headerText = s(interaction).info.SHOP_HEADER.f({u: usernameText, t: shop.expires});
    }
    else headerText = s(interaction).info.SHOP_HEADER.f({u: valorantUser.username, t: shop.expires}, interaction);

    const embeds = [basicEmbed(headerText)];

    for(const uuid of shop.offers) {
        const skin = await getSkin(uuid);
        const embed = await skinEmbed(skin.uuid, skin.price, interaction, VPemoji);
        embeds.push(embed);
    }

    let components;
    if(forOtherUser) components = null;
    else components = switchAccountButtons(interaction, "shop", true);

    return {
        embeds, components
    };
}

export const renderBundles = async (bundles, interaction, VPemoji) => {
    if(!bundles.success) return authFailureMessage(interaction, bundles, s(interaction).error.AUTH_ERROR_BUNDLES);

    bundles = bundles.bundles;

    if(bundles.length === 1) {
        const bundle = await getBundle(bundles[0].uuid);

        const renderedBundle = await renderBundle(bundle, interaction, VPemoji, false);
        const titleEmbed = renderedBundle.embeds[0];
        titleEmbed.title = s(interaction).info.BUNDLE_HEADER.f({b: titleEmbed.title});
        titleEmbed.description += ` *(${s(interaction).info.EXPIRES.f({t: bundle.expires})})*`;

        return renderedBundle;
    }

    const embeds = [{
        title: s(interaction).info.BUNDLES_HEADER,
        description: s(interaction).info.BUNDLES_HEADER_DESC,
        color: VAL_COLOR_1
    }];

    const buttons = [];

    for(const bundleData of bundles) {
        const bundle = await getBundle(bundleData.uuid);

        const subName = bundle.subNames ? l(bundle.subNames, interaction) + "\n" : "";
        const slantedDescription = bundle.descriptions ? "*" + l(bundle.descriptions, interaction) + "*\n" : "";
        const embed = {
            title: s(interaction).info.BUNDLE_NAME.f({b: l(bundle.names, interaction)}),
            description: `${subName}${slantedDescription}${VPemoji} **${bundle.price || s(interaction).info.FREE}** - ${s(interaction).info.EXPIRES.f({t:bundle.expires})}`,
            color: VAL_COLOR_2,
            thumbnail: {
                url: bundle.icon
            }
        };
        embeds.push(embed);

        if(buttons.length < 5) {
            buttons.push(new MessageButton().setCustomId(`viewbundle/${interaction.user.id}/${bundle.uuid}`).setStyle("PRIMARY").setLabel(l(bundle.names, interaction)).setEmoji("🔎"));
        }
    }

    return {
        embeds: embeds,
        components: [new MessageActionRow().addComponents(...buttons)]
    };
}

export const renderBundle = async (bundle, interaction, emoji, includeExpires=true) => {
    const subName = bundle.subNames ? l(bundle.subNames, interaction) + "\n" : "";
    const slantedDescription = bundle.descriptions ? "*" + l(bundle.descriptions, interaction) + "*\n" : "";
    const strikedBundleBasePrice = bundle.basePrice ? " ~~" + bundle.basePrice + "~~" : "";

    if(!bundle.items) return {embeds: [{
        title: s(interaction).info.BUNDLE_NAME.f({b: l(bundle.names, interaction)}),
        description: `${subName}${slantedDescription}`,
        color: VAL_COLOR_1,
        image: {
            url: bundle.icon
        },
        footer: {
            text: s(interaction).info.NO_BUNDLE_DATA
        }
    }]};

    const bundleTitleEmbed = {
        title: s(interaction).info.BUNDLE_NAME.f({b: l(bundle.names, interaction)}),
        description: `${subName}${slantedDescription}${emoji} **${bundle.price}**${strikedBundleBasePrice}`,
        color: VAL_COLOR_3,
        image: {
            url: bundle.icon
        }
    }

    if(includeExpires && bundle.expires) bundleTitleEmbed.description += ` (${(bundle.expires > Date.now() / 1000 ? 
        s(interaction).info.EXPIRES : s(interaction).info.EXPIRED).f({t: bundle.expires})})`;

    const itemEmbeds = await renderBundleItems(bundle, interaction, emoji);
    return {
        embeds: [bundleTitleEmbed, ...itemEmbeds]
    }
}

export const renderNightMarket = async (market, interaction, valorantUser, emoji) => {
    if(!market.success) return authFailureMessage(interaction, market, s(interaction).error.AUTH_ERROR_NMARKET);

    if(!market.offers) return {embeds: [basicEmbed(s(interaction).error.NO_NMARKET)]};

    const embeds = [{
        description: s(interaction).info.NMARKET_HEADER.f({u: valorantUser.username, t: market.expires}, interaction),
        color: VAL_COLOR_3
    }];

    for(const offer of market.offers) {
        const skin = await getSkin(offer.uuid);

        const embed = await skinEmbed(skin.uuid, skin.price, interaction, emoji);
        embed.description = `${emoji} **${offer.nmPrice}**\n${emoji} ~~${offer.realPrice}~~ (-${offer.percent}%)`;

        embeds.push(embed);
    }

    const components = switchAccountButtons(interaction, "nm", true);
    return {
        embeds, components
    };
}

export const renderBattlepass = async (battlepass, targetlevel, interaction) => {
    if(!battlepass.success) return authFailureMessage(interaction, battlepass, s(interaction).error.AUTH_ERROR_BPASS);

    const user = getUser(interaction.user.id);

    let embeds = []
    if(battlepass.bpdata.progressionLevelReached < 55) {
        embeds.push({
            title: s(interaction).battlepass.CALCULATIONS_TITLE,
            thumbnail: {url: thumbnails[Math.floor(Math.random()*thumbnails.length)]},
            description: `${s(interaction).battlepass.TIER_HEADER.f({u: user.username}, interaction)}\n${createProgressBar(battlepass.xpneeded, battlepass.bpdata.progressionTowardsNextLevel, battlepass.bpdata.progressionLevelReached)}`,
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
                text: battlepass.battlepassPurchased ? s(interaction).battlepass.BP_PURCHASED.f({u: user.username}, interaction) : ""
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
        });
    } else {
        embeds.push({
            description: s(interaction).battlepass.FINISHED,
            color: VAL_COLOR_1,
        })
    }

    const components = switchAccountButtons(interaction, "bp");

    return {embeds, components};
}

const renderBundleItems = async (bundle, interaction, VPemojiString) => {
    if(!bundle.items) return [];

    const priorities = {};
    priorities[itemTypes.SKIN] = 5;
    priorities[itemTypes.BUDDY] = 4;
    priorities[itemTypes.SPRAY] = 3;
    priorities[itemTypes.CARD] = 2;
    priorities[itemTypes.TITLE] = 1;

    const items = bundle.items.sort((a, b) => priorities[b.type] - priorities[a.type]);

    const embeds = [];
    for(const item of items) {
        const embed = await bundleItemEmbed(item, interaction, VPemojiString);

        if(item.amount !== 1) embed.title = `${item.amount}x ${embed.title}`
        if(item.type === itemTypes.SKIN) embed.color = VAL_COLOR_1;
        if(item.basePrice && item.price !== item.basePrice) {
            embed.description = `${VPemojiString} **${item.price || s(interaction).info.FREE}** ~~${item.basePrice}~~`;
            if(item.type === itemTypes.TITLE) embed.description = "`" + item.item.text + "`\n\n" + embed.description
        }

        embeds.push(embed);
    }

    // discord has a limit of 10 embeds (9 if we count the bundle title)
    if(embeds.length > 9) {
        embeds.length = 8;
        embeds.push(basicEmbed(s(interaction).info.MORE_ITEMS.f({n: items.length - 8})));
    }

    return embeds;
}

const bundleItemEmbed = async (item, interaction, VPemojiString) => {
    switch(item.type) {
        case itemTypes.SKIN: return skinEmbed(item.uuid, item.price, interaction, VPemojiString);
        case itemTypes.BUDDY: return buddyEmbed(item.uuid, item.price, interaction.locale, VPemojiString);
        case itemTypes.CARD: return cardEmbed(item.uuid, item.price, interaction.locale, VPemojiString);
        case itemTypes.SPRAY: return sprayEmbed(item.uuid, item.price, interaction.locale, VPemojiString);
        case itemTypes.TITLE: return titleEmbed(item.uuid, item.price, interaction.locale, VPemojiString);
        default: return basicEmbed(s(interaction).error.UNKNOWN_ITEM_TYPE.f({t: item.type}));
    }
}

const skinEmbed = async (uuid, price, interaction, VPemojiString) => {
    const skin = await getSkin(uuid);
    return {
        title: await skinNameAndEmoji(skin, interaction.channel, interaction.locale),
        url: config.linkItemImage ? skin.icon : null,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: skin.icon
        }
    };
}

const buddyEmbed = async (uuid, price, locale, VPemojiString) => {
    const buddy = await getBuddy(uuid);
    return {
        title: l(buddy.names, locale),
        url: config.linkItemImage ? buddy.icon : null,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: buddy.icon
        }
    }
}

const cardEmbed = async (uuid, price, locale, VPemojiString) => {
    const card = await getCard(uuid);
    return {
        title: l(card.names, locale),
        url: config.linkItemImage ? card.icons.large : null,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: card.icons.large
        }
    }
}

const sprayEmbed = async (uuid, price, locale, VPemojiString) => {
    const spray = await getSpray(uuid);
    return {
        title: l(spray.names, locale),
        url: config.linkItemImage ? spray.icon : null,
        description: priceDescription(VPemojiString, price),
        color: VAL_COLOR_2,
        thumbnail: {
            url: spray.icon
        }
    }
}

const titleEmbed = async (uuid, price, locale, VPemojiString) => {
    const title = await getTitle(uuid);
    return {
        title: l(title.names, locale),
        description: "`" + title.text + "`\n\n" + (priceDescription(VPemojiString, price) || ""),
        color: VAL_COLOR_2,
    }
}

const Weapons = {
    Classic: "29a0cfab-485b-f5d5-779a-b59f85e204a8",
    Shorty: "42da8ccc-40d5-affc-beec-15aa47b42eda",
    Frenzy: "44d4e95c-4157-0037-81b2-17841bf2e8e3",
    Ghost: "1baa85b4-4c70-1284-64bb-6481dfc3bb4e",
    Sheriff: "e336c6b8-418d-9340-d77f-7a9e4cfe0702",

    Stinger: "f7e1b454-4ad4-1063-ec0a-159e56b58941",
    Spectre: "462080d1-4035-2937-7c09-27aa2a5c27a7",
    Bucky: "910be174-449b-c412-ab22-d0873436b21b",
    Judge: "ec845bf4-4f79-ddda-a3da-0db3774b2794",

    Bulldog: "ae3de142-4d85-2547-dd26-4e90bed35cf7",
    Guardian: "4ade7faa-4cf1-8376-95ef-39884480959b",
    Phantom: "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a",
    Vandal: "9c82e19d-4575-0200-1a81-3eacf00cf872",

    Marshal: "c4883e50-4494-202c-3ec3-6b8a9284f00b",
    Operator: "a03b24d3-4319-996d-0f8c-94bbfba1dfc7",
    Ares: "55d8a0f4-4274-ca67-fe2c-06ab45efdf58",
    Odin: "63e6c2b6-4a8e-869c-3d4c-e38355226584",
    Knife: "2f59173c-4bed-b6c3-2191-dea9b58be9c7",
}

export const skinCollectionSingleEmbed = async (interaction, id, user, loadout) => {
    const someoneElseUsedCommand = interaction.message ?
        interaction.message.interaction && interaction.message.interaction.user.id !== user.id :
        interaction.user.id !== user.id;

    let totalValue = 0;

    const createField = async (weaponUuid, inline=true) => {
        const weapon = await getWeapon(weaponUuid);
        const skin = await getSkinFromSkinUuid(loadout.Guns.find(gun => gun.ID === weaponUuid).SkinID);

        totalValue += skin.price;

        return {
            name: l(weapon.names, interaction),
            value: await skinNameAndEmoji(skin, interaction.channel, interaction.locale),
            inline: inline
        }
    }

    const emptyField = {
        name: "\u200b",
        value: "\u200b",
        inline: true
    }

    const fields = [
        await createField(Weapons.Vandal),
        await createField(Weapons.Phantom),
        await createField(Weapons.Operator),

        await createField(Weapons.Knife),
        await createField(Weapons.Sheriff),
        await createField(Weapons.Spectre),

        await createField(Weapons.Classic),
        await createField(Weapons.Ghost),
        await createField(Weapons.Frenzy),

        await createField(Weapons.Bulldog),
        await createField(Weapons.Guardian),
        await createField(Weapons.Marshal),

        await createField(Weapons.Stinger),
        await createField(Weapons.Ares),
        await createField(Weapons.Odin),

        await createField(Weapons.Shorty),
        await createField(Weapons.Bucky),
        await createField(Weapons.Judge),
    ]

    const emoji = await VPEmoji(interaction);
    fields.push(emptyField, {
        name: s(interaction).info.COLLECTION_VALUE,
        value: `${emoji} ${totalValue}`,
        inline: true
    }, emptyField);

    let usernameText;
    if(someoneElseUsedCommand) {
        usernameText = `<@${id}>`;

        const json = readUserJson(id);
        if(json.accounts.length > 1) usernameText += ' ' + s(interaction).info.SWITCH_ACCOUNT_BUTTON.f({n: json.currentAccount});
    }
    else usernameText = user.username;


    const embed = {
        description: s(interaction).info.COLLECTION_HEADER.f({u: usernameText}, id),
        color: VAL_COLOR_1,
        fields: fields
    }

    const components = [new MessageActionRow().addComponents(collectionSwitchEmbedButton(interaction, true, id)),]
    if(!someoneElseUsedCommand) components.push(...switchAccountButtons(interaction, "cl", false, id))

    return {
        embeds: [embed],
        components: components
    }
}

export const skinCollectionPageEmbed = async (interaction, id, user, loadout, pageIndex=0) => {
    const someoneElseUsedCommand = interaction.message ?
        interaction.message.interaction && interaction.message.interaction.user.id !== user.id :
        interaction.user.id !== user.id;

    let totalValue = 0;
    const emoji = await VPEmoji(interaction);

    const createEmbed = async (weaponUuid) => {
        const weapon = await getWeapon(weaponUuid);
        const skin = await getSkinFromSkinUuid(loadout.Guns.find(gun => gun.ID === weaponUuid).SkinID);

        totalValue += skin.price;

        return {
            title: l(weapon.names, interaction),
            description: `**${await skinNameAndEmoji(skin, interaction.channel, interaction.locale)}**\n${emoji} ${skin.price || 'N/A'}`,
            color: VAL_COLOR_2,
            thumbnail: {
                url: skin.icon
            }
        }
    }

    const pages = [
        [Weapons.Vandal, Weapons.Phantom, Weapons.Operator, Weapons.Knife],
        [Weapons.Classic, Weapons.Sheriff, Weapons.Spectre, Weapons.Marshal],
        [Weapons.Frenzy, Weapons.Ghost, Weapons.Bulldog, Weapons.Guardian],
        [Weapons.Shorty, Weapons.Bucky, Weapons.Judge],
        [Weapons.Stinger, Weapons.Ares, Weapons.Odin],
    ];

    if(pageIndex < 0) pageIndex = pages.length - 1;
    if(pageIndex >= pages.length) pageIndex = 0;

    let usernameText;
    if(someoneElseUsedCommand) {
        usernameText = `<@${id}>`;

        const json = readUserJson(id);
        if(json.accounts.length > 1) usernameText += ' ' + s(interaction).info.SWITCH_ACCOUNT_BUTTON.f({n: json.currentAccount});
    }
    else usernameText = user.username;

    const embeds = [basicEmbed(s(interaction).info.COLLECTION_HEADER.f({u: usernameText}, id))];
    for(const weapon of pages[pageIndex]) {
        embeds.push(await createEmbed(weapon));
    }

    const firstRowButtons = [collectionSwitchEmbedButton(interaction, false, id)];
    firstRowButtons.push(...(pageButtons("clpage", id, pageIndex, pages.length).components))

    const components = [new MessageActionRow().setComponents(...firstRowButtons)]
    if(!someoneElseUsedCommand) components.push(...switchAccountButtons(interaction, "cl", false, id));

    return {embeds, components}
}

const collectionSwitchEmbedButton = (interaction, switchToPage, id) => {
    const label = s(interaction).info[switchToPage ? "COLLECTION_VIEW_IMAGES" : "COLLECTION_VIEW_ALL"];
    const customId = `clswitch/${switchToPage ? "p" : "s"}/${id}`;
    return new MessageButton().setEmoji('🔍').setLabel(label).setStyle("PRIMARY").setCustomId(customId);
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
            name: ":dog2:",
            value: s(interaction).info.INFO_WOOF,
            inline: true
        }
    ];
    if(ownerString) fields.push({
        name: s(interaction).info.INFO_OWNER,
        value: ownerString || "Giorgio#0609",
        inline: true
    });
    if(interaction.client.shard) fields.push({
        name: "Running on shard",
        value: interaction.client.shard.ids.join(' ') || "No shard id...?",
        inline: true
    });
    if(status) fields.push({
        name: s(interaction).info.INFO_STATUS,
        value: status || "Up and running!",
        inline: true
    });

    const readyTimestamp = Math.round(client.readyTimestamp / 1000);

    return {
        embeds: [{
            title: s(interaction).info.INFO_HEADER,
            description: s(interaction).info.INFO_RUNNING.f({t1: readyTimestamp, t2: readyTimestamp}),
            color: VAL_COLOR_1,
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

const pageButtons = (pageId, userId, current, max) => {
    const leftButton = new MessageButton().setStyle("SECONDARY").setEmoji("◀").setCustomId(`${pageId}/${userId}/${current - 1}`);
    const rightButton = new MessageButton().setStyle("SECONDARY").setEmoji("▶").setCustomId(`${pageId}/${userId}/${current + 1}`);

    if(current === 0) leftButton.setEmoji("⏪");
    if(current === max - 1) rightButton.setEmoji("⏩");

    return new MessageActionRow().setComponents(leftButton, rightButton);
}

export const switchAccountButtons = (interaction, customId, oneAccountButton=false, id=interaction.user.id) => {
    const json = removeDupeAccounts(id);
    if(!json || json.accounts.length === 1 && !oneAccountButton) return [];
    const accountNumbers = [...Array(json.accounts.length).keys()].map(n => n + 1).slice(0, 5);
    const hideIgn = getSetting(id, "hideIgn");

    const buttons = [];
    for(const number of accountNumbers) {
        const username = json.accounts[number - 1].username || s(interaction).info.NO_USERNAME;
        const label = hideIgn ? s(interaction).info.SWITCH_ACCOUNT_BUTTON.f({n: number.toString()}) : username;

        const button = new MessageButton().setStyle("SECONDARY").setLabel(label).setCustomId(`account/${customId}/${id}/${number}`);
        button.setDisabled(number === json.currentAccount);

        buttons.push(button);
    }

    return [new MessageActionRow().setComponents(...buttons)];
}

const alertFieldDescription = async (interaction, channel_id, emojiString, price) => {
    if(channel_id === interaction.channelId) {
        if(price) return `${emojiString} ${price}`;
        if(config.fetchSkinPrices) return s(interaction).info.SKIN_NOT_FOR_SALE;
        return s(interaction).info.SKIN_PRICES_HIDDEN;
    } else {
        const channel = await fetchChannel(channel_id);
        if(channel && !channel.guild) return s(interaction).info.ALERT_IN_DM_CHANNEL;
        return s(interaction).info.ALERT_IN_CHANNEL.f({c: channel_id})
    }
}

export const alertsPageEmbed = async (interaction, alerts, pageIndex, emojiString) => {
    const components = switchAccountButtons(interaction, "alerts");

    alerts = alerts.filter(alert => alert.uuid);

    if(alerts.length === 0) {
        return {
            embeds: [basicEmbed(s(interaction).error.NO_ALERTS)],
            components: components
        }
    }

    if(alerts.length === 1) {
        const alert = alerts[0];

        const skin = await getSkin(alert.uuid);

        return {
            embeds: [{
                title: s(interaction).info.ONE_ALERT,
                color: VAL_COLOR_1,
                description: `**${await skinNameAndEmoji(skin, interaction.channel, interaction.locale)}**\n${await alertFieldDescription(interaction, alert.channel_id, emojiString, skin.price)}`,
                thumbnail: {
                    url: skin.icon
                }
            }],
            components: [removeAlertActionRow(interaction.user.id, alert.uuid, s(interaction).info.REMOVE_ALERT_BUTTON)].concat(components),
            ephemeral: true
        }
    }

    const maxPages = Math.ceil(alerts.length / config.alertsPerPage);

    if(pageIndex < 0) pageIndex = maxPages - 1;
    if(pageIndex >= maxPages) pageIndex = 0;

    const embed = { // todo switch this to a "one embed per alert" message, kinda like /shop
        title: s(interaction).info.MULTIPLE_ALERTS,
        color: VAL_COLOR_1,
        footer: {
            text: s(interaction).info.REMOVE_ALERTS_FOOTER
        },
        fields: []
    }
    const buttons = [];

    let n = pageIndex * config.alertsPerPage;
    const alertsToRender = alerts.slice(n, n + config.alertsPerPage);
    for(const alert of alertsToRender) {
        const skin = await getSkin(alert.uuid);
        embed.fields.push({
            name: `**${n+1}.** ${await skinNameAndEmoji(skin, interaction.channel, interaction.locale)}`,
            value: await alertFieldDescription(interaction, alert.channel_id, emojiString, skin.price),
            inline: alerts.length > 5
        });
        buttons.push(removeAlertButton(interaction.user.id, alert.uuid, `${n+1}.`));
        n++;
    }

    const actionRows = [];
    for(let i = 0; i < alertsToRender.length; i += 5) {
        const actionRow = new MessageActionRow();
        for(let j = i; j < i + 5 && j < alertsToRender.length; j++) {
            actionRow.addComponents(buttons[j]);
        }
        actionRows.push(actionRow);
    }
    if(maxPages > 1) actionRows.push(pageButtons("changealertspage", interaction.user.id, pageIndex, maxPages));

    if(actionRows.length < 5) actionRows.push(...components);

    return {
        embeds: [embed],
        components: actionRows
    }
}

export const alertTestResponse = async (interaction, success) => {
    if(success) {
        await interaction.followUp({
            embeds: [secondaryEmbed(s(interaction).info.ALERT_TEST_SUCCESSFUL)]
        });
    } else {
        await interaction.followUp({
            embeds: [basicEmbed(s(interaction).error.ALERT_NO_PERMS)]
        });
    }
}

export const allStatsEmbed = async (interaction, stats, pageIndex=0) => {
    const skinCount = Object.keys(stats.items).length;

    if(skinCount === 0) return {
        embeds: [basicEmbed(config.trackStoreStats ? s(interaction).error.EMPTY_STATS : s(interaction).error.STATS_DISABLED)]
    }

    const maxPages = Math.ceil(skinCount / config.statsPerPage);

    if(pageIndex < 0) pageIndex = maxPages - 1;
    if(pageIndex >= maxPages) pageIndex = 0;

    const skinsToDisplay = Object.keys(stats.items).slice(pageIndex * config.statsPerPage, pageIndex * config.statsPerPage + config.statsPerPage);
    const embeds = [basicEmbed(s(interaction).info.STATS_HEADER.f({c: stats.shopsIncluded, p: pageIndex + 1, t: maxPages}))];
    for(const uuid of skinsToDisplay) {
        const skin = await getSkin(uuid);
        const statsForSkin = getStatsFor(uuid);
        embeds.push(await statsForSkinEmbed(skin, statsForSkin, interaction));
    }

    return {
        embeds: embeds,
        components: [pageButtons("changestatspage", interaction.user.id, pageIndex, maxPages)]
    }
}

export const statsForSkinEmbed = async (skin, stats, interaction) => {
    let description;
    if(stats.count === 0) description = s(interaction).error.NO_STATS_FOR_SKIN.f({d: config.statsExpirationDays || '∞'});
    else {
        const percentage = Math.round(stats.count / stats.shopsIncluded * 100 * 100) / 100;
        const crownEmoji = stats.rank[0] === 1 || stats.rank[0] === stats.rank[1] ? ':crown: ' : '';
        description = s(interaction).info.STATS_DESCRIPTION.f({c: crownEmoji, r: stats.rank[0], t: stats.rank[1], p: percentage});
    }

    return {
        title: await skinNameAndEmoji(skin, interaction.channel, interaction.locale),
        description: description,
        color: VAL_COLOR_2,
        thumbnail: {
            url: skin.icon
        }
    }
}

export const accountsListEmbed = (interaction, userJson) => {
    const fields = [];
    for(const [i, account] of Object.entries(userJson.accounts)) {
        let fieldValue;
        if(!account.username) fieldValue = s(interaction).info.NO_USERNAME;
        else fieldValue = account.username;

        fields.push({
            name: `${parseInt(i) + 1}. ${userJson.currentAccount === parseInt(i) + 1 ? s(interaction).info.ACCOUNT_CURRENTLY_SELECTED : ''}`,
            value: fieldValue,
            inline: true
        });
    }

    const hideIgn = getSetting(interaction.user.id, "hideIgn");

    return {
        embeds: [{
            title: s(interaction).info.ACCOUNTS_HEADER,
            fields: fields,
            color: VAL_COLOR_1
        }],
        ephemeral: hideIgn
    }
}

export const settingsEmbed = (userSettings, interaction) => {
    const embed = {
        title: s(interaction).settings.VIEW_HEADER,
        description: s(interaction).settings.VIEW_DESCRIPTION,
        color: VAL_COLOR_1,
        fields: []
    }

    for(const [setting, value] of Object.entries(userSettings)) {
        embed.fields.push({
            name: settingName(setting, interaction),
            value: humanifyValue(value, interaction, true),
            inline: true
        });
    }

    return {
        embeds: [embed]
    }
}

export const valMaintenancesEmbeds = (interaction, {maintenances, incidents, id: regionName}) => {
    const embeds = [];
    for(const maintenance of maintenances) {
        embeds.push(valMaintenanceEmbed(interaction, maintenance, false, regionName));
    }
    for(const incident of incidents) {
        embeds.push(valMaintenanceEmbed(interaction, incident, true, regionName));
    }

    if(!embeds.length) {
        embeds.push(basicEmbed(s(interaction).info.NO_MAINTENANCES.f({r: regionName})));
    }

    return {
        embeds: embeds
    }
}

export const valMaintenanceEmbed = (interaction, target, isIncident, regionName) => {
    const update = target.updates[0] || {};
    const strings = update.translations || target.titles;
    const string = (strings.find(s => s.locale === (discToValLang[interaction.locale] || DEFAULT_VALORANT_LANG)) || strings[0]).content;
    const lastUpdate = Math.round(new Date(update.created_at || target.created_at) / 1000);
    const targetType = isIncident ? s(interaction).info.INCIDENT_TYPE : s(interaction).info.MAINTENANCE_TYPE;

    return {
        title: s(interaction).info.MAINTENANCE_HEADER.f({t: targetType, r: regionName}),
        description: `> ${string}\n*${s(interaction).info.LAST_UPDATED.f({t: lastUpdate})}*`,
    }
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
