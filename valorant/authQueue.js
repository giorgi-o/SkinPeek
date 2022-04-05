import {redeem2FACode, redeemUsernamePassword} from "./auth.js";
import config from "../misc/config.js";
import {wait} from "../misc/util.js";

const Operations = {
    USERNAME_PASSWORD: "up",
    MFA: "mf",
    NULL: "00"
}

const queue = [];
const queueResults = [];
let queueCounter = 0;

export const queueUsernamePasswordLogin = async (id, username, password) => {
    if(!config.useLoginQueue) return {inQueue: false, ...await redeemUsernamePassword(id, username, password)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.USERNAME_PASSWORD,
        c, id, username, password,
    });
    console.debug(`Added Username+Password login to queue for user ${id} (c=${c})`);
    return {inQueue: true, c};
}

export const queue2FACodeRedeem = async (id, code) => {
    if(!config.useLoginQueue) return {inQueue: false, ...await redeem2FACode(id, code)};
    const c = queueCounter++;
    queue.push({ // should 2FA redeems be given priority?
        operation: Operations.MFA,
        c, id, code
    });
    console.debug(`Added 2fa code redeem to queue for user ${id} (c=${c})`);
    return {inQueue: true, c};
}

export const queueNullOperation = async (timeout) => {  // used for stress-testing the auth queue
    if(!config.useLoginQueue) return {inQueue: false, ...await wait(timeout)};
    const c = queueCounter++;
    queue.push({
        operation: Operations.NULL,
        c, timeout
    });
    console.debug(`Added null operation to queue with timeout ${timeout} (c=${c})`);
    return {inQueue: true, c};
}

export const processQueue = async () => {
    if(!queue.length) return;

    const item = queue.shift();
    console.debug(`Processing queue item "${item.operation}" for ${item.id} (c=${item.c})`);

    let result;
    try {
        switch (item.operation) {
            case Operations.USERNAME_PASSWORD:
                result = await redeemUsernamePassword(item.id, item.username, item.password);
                break;
            case Operations.MFA:
                result = await redeem2FACode(item.id, item.code);
                break;
            case Operations.NULL:
                await wait(item.timeout);
                result = {success: true};
                break;
        }
    } catch(e) {
        result = {success: false}
    }

    queueResults.push({
        c: item.c,
        result
    });
}

export const getQueueItemStatus = (c) => {
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
