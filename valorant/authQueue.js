import {redeem2FACode, redeemUsernamePassword} from "./auth.js";
import config from "../misc/config.js";

const Operations = {
    USERNAME_PASSWORD: "up",
    MFA: "mf"
}

const queue = [];
let queueCounter = 0;
const queueResults = [];

export const queueUsernamePasswordLogin = async (id, username, password) => {
    if(!config.useLoginQueue) return {inQueue: false, ...await redeemUsernamePassword(id, username, password)};
    queue.push({
        operation: Operations.USERNAME_PASSWORD,
        c: queueCounter++,
        id, username, password,
    });
    console.debug(`Added Username+Password login to queue for user ${id}`);
    return {inQueue: true, c: queueCounter - 1};
}

export const queue2FACodeRedeem = async (id, code) => {
    if(!config.useLoginQueue) return {inQueue: false, ...await redeem2FACode(id, code)};
    queue.push({ // should 2FA redeems be given priority?
        operation: Operations.MFA,
        c: queueCounter++,
        id, code
    });
    console.debug(`Added 2fa code redeem to queue for user ${id}`);
    return {inQueue: true, c: queueCounter - 1};
}

export const processQueue = async () => {
    if(!queue.length) return;

    const item = queue[0];
    console.debug(`Processing queue item "${item.operation}" for ${item.id}`);

    let result;
    try {
        switch (item.operation) {
            case Operations.USERNAME_PASSWORD:
                result = await redeemUsernamePassword(item.id, item.username, item.password);
                break;
            case Operations.MFA:
                result = await redeem2FACode(item.id, item.code);
                break;
        }
    } catch(e) {
        result = {success: false}
    }

    queueResults.push({
        c: item.c,
        result
    });
    queue.shift();
}

export const getQueueItemStatus = (c) => {
    let item = queue.find(i => i.c === c);
    if(item) return {processed: false, remaining: queue[0].c - c};

    const index = queueResults.findIndex(i => i.c === c);
    item = queueResults[index];
    queueResults.splice(index, 1);
    return {processed: true, result: item.result};
}
