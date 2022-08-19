import {fetchChannel, wait} from "../misc/util.js";
import {VPEmoji} from "../discord/emoji.js";
import {getShopQueueItemStatus, queueBundles, queueItemShop, queueNightMarket} from "./shopQueue.js";
import {renderBundles, renderNightMarket, renderOffers} from "../discord/embed.js";

export const fetchShop = async (interaction, user, targetId=interaction.user.id) => {
    // fetch the channel if not in cache
    const channel = interaction.channel || await fetchChannel(interaction.channelId);

    // start uploading emoji now
    const emojiPromise = VPEmoji(interaction, channel);

    let shop = await queueItemShop(targetId);
    while(shop.inQueue) {
        const queueStatus = getShopQueueItemStatus(shop.c);
        if(queueStatus.processed) shop = queueStatus.result;
        else await wait(150);
    }

    return await renderOffers(shop, interaction, user, await emojiPromise, targetId);
}

export const fetchBundles = async (interaction) => {
    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    const emojiPromise = VPEmoji(interaction, channel);

    let bundles = await queueBundles(interaction.user.id);
    while(bundles.inQueue) {
        const queueStatus = getShopQueueItemStatus(bundles.c);
        if(queueStatus.processed) bundles = queueStatus.result;
        else await wait(150);
    }

    return await renderBundles(bundles, interaction, await emojiPromise);
}

export const fetchNightMarket = async (interaction, user) => {
    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    const emojiPromise = VPEmoji(interaction, channel);

    let market = await queueNightMarket(interaction.user.id);
    while(market.inQueue) {
        const queueStatus = getShopQueueItemStatus(market.c);
        if(queueStatus.processed) market = queueStatus.result;
        else await wait(150);
    }

    return await renderNightMarket(market, interaction, user, await emojiPromise);
}
