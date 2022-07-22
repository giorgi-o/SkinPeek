import config from "../misc/config.js";
import {wait} from "../misc/util.js";
import {getBundles, getNightMarket, getOffers} from "./shop.js";

export const Operations = {
    SHOP: "sh",
    NIGHT_MARKET: "nm",
    BUNDLES: "bu",
    NULL: "00"
}

const queue = [];
const queueResults = [];
let queueCounter = 0;

export const queueItemShop = async (id) => {
    if(!config.useShopQueue) return {inQueue: false, ...await getOffers(id)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.SHOP,
        c, id
    });
    console.log(`Added item shop fetch to shop queue for user ${id} (c=${c})`);
    return {inQueue: true, c};
}

export const queueNightMarket = async (id) => {
    if(!config.useShopQueue) return {inQueue: false, ...await getNightMarket(id)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.NIGHT_MARKET,
        c, id
    });
    console.log(`Added night market fetch to shop queue for user ${id} (c=${c})`);
    return {inQueue: true, c};
}

export const queueBundles = async (id) => {
    if(!config.useShopQueue) return {inQueue: false, ...await getBundles(id)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.BUNDLES,
        c, id
    });
    console.log(`Added bundles fetch to shop queue for user ${id} (c=${c})`);
    return {inQueue: true, c};
}

export const queueNullOperation = async (timeout) => {  // used for stress-testing the shop queue
    if(!config.useShopQueue) return {inQueue: false, ...await wait(timeout)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.NULL,
        c, timeout
    });
    console.log(`Added null operation to shop queue with timeout ${timeout} (c=${c})`);
    return {inQueue: true, c};
}

export const processShopQueue = async () => {
    if(!config.useShopQueue || !queue.length) return;

    const item = queue.shift();
    console.log(`Processing shop queue item "${item.operation}" for ${item.id} (c=${item.c})`);

    let result;
    try {
        switch (item.operation) {
            case Operations.SHOP:
                result = await getOffers(item.id);
                break;
            case Operations.NIGHT_MARKET:
                result = await getNightMarket(item.id);
                break;
            case Operations.BUNDLES:
                result = await getBundles(item.id);
                break;
            case Operations.NULL:
                await wait(item.timeout);
                result = {success: true};
                break;
        }
    } catch(e) {
        console.error(`Error processing shop queue item "${item.operation}" for ${item.id} (c=${item.c})`);
        console.error(e);
        result = {success: false, error: e};
    }

    queueResults.push({
        c: item.c,
        result
    });
}

export const getShopQueueItemStatus = (c) => {
    let item = queue.find(i => i.c === c);
    if(item) return {processed: false, remaining: queue[0].c - c};

    const index = queueResults.findIndex(i => i.c === c);
    if(index === -1) { // currently processing
        return {processed: false, remaining: 0};
    }

    item = queueResults[index];
    queueResults.splice(index, 1);
    return {processed: true, result: item.result};
}
