import {fetchChannel, wait} from "../misc/util.js";
import {VPEmoji} from "../discord/emoji.js";
import {getShopQueueItemStatus, queueBundles, queueItemShop, queueNightMarket, queueShop} from "./shopQueue.js";
import {renderBundles, renderNightMarket, renderOffers} from "../discord/embed.js";
import {waitForAuthQueueResponse} from "../discord/authManager.js";
import {getUser} from "./auth.js";

export const waitForShopQueueResponse = async (queueResponse, pollRate=150) => {
    while(true) {
        let response = getShopQueueItemStatus(queueResponse.c);
        if(response.processed) return response.result;
        await wait(pollRate);
    }
}

export const fetchShop = async (interaction, user, targetId=interaction.user.id) => {
    // fetch the channel if not in cache
    const channel = interaction.channel || await fetchChannel(interaction.channelId);

    // start uploading emoji now
    const emojiPromise = VPEmoji(interaction, channel);

    let shop = await queueItemShop(targetId);
    if(shop.inQueue) shop = await waitForShopQueueResponse(shop);

    user = getUser(user);
    return await renderOffers(shop, interaction, user, await emojiPromise, targetId);
}

export const fetchBundles = async (interaction) => {
    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    const emojiPromise = VPEmoji(interaction, channel);

    let bundles = await queueBundles(interaction.user.id);
    if(bundles.inQueue) bundles = await waitForShopQueueResponse(bundles);

    return await renderBundles(bundles, interaction, await emojiPromise);
}

export const fetchNightMarket = async (interaction, user) => {
    const channel = interaction.channel || await fetchChannel(interaction.channelId);
    const emojiPromise = VPEmoji(interaction, channel);

    let market = await queueNightMarket(interaction.user.id);
    if(market.inQueue) market = await waitForShopQueueResponse(market);

    return await renderNightMarket(market, interaction, user, await emojiPromise);
}

export const fetchRawShop = async (id, account=null) => {
    let offers = await queueShop(id, account);
    if(offers.inQueue) offers = await waitForAuthQueueResponse(offers);
    return offers
}
