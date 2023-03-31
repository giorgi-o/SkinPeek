import {redeem2FACode, redeemCookies, redeemUsernamePassword} from "./auth.js";
import config from "../misc/config.js";
import {wait} from "../misc/util.js";
import {
    mqGetAuthQueueItemStatus,
    mqLogin2fa,
    mqLoginCookies,
    mqLoginUsernamePass, mqNullOperation,
    useMultiqueue
} from "../misc/multiqueue.js";

export const Operations = {
    USERNAME_PASSWORD: "up",
    MFA: "mf",
    COOKIES: "ck",
    NULL: "00"
}

const queue = [];
const queueResults = [];
let queueCounter = 1;
let processingCount = 0;

let authQueueInterval;
let lastQueueProcess = 0; // timestamp

export const startAuthQueue = () => {
    clearInterval(authQueueInterval);
    if(config.useLoginQueue) authQueueInterval = setInterval(processAuthQueue, config.loginQueueInterval);
}

export const queueUsernamePasswordLogin = async (id, username, password) => {
    if(!config.useLoginQueue) return await redeemUsernamePassword(id, username, password);
    if(useMultiqueue()) return await mqLoginUsernamePass(id, username, password);

    const c = queueCounter++;
    queue.push({
        operation: Operations.USERNAME_PASSWORD,
        c, id, username, password,
    });
    console.log(`Added Username+Password login to auth queue for user ${id} (c=${c})`);

    if(processingCount === 0) await processAuthQueue();
    return {inQueue: true, c};
}

export const queue2FACodeRedeem = async (id, code) => {
    if(!config.useLoginQueue) return await redeem2FACode(id, code);
    if(useMultiqueue()) return {inQueue: false, ...await mqLogin2fa(id, code)};

    const c = queueCounter++;
    queue.push({ // should 2FA redeems be given priority?
        operation: Operations.MFA,
        c, id, code
    });
    console.log(`Added 2fa code redeem to auth queue for user ${id} (c=${c})`);

    if(processingCount === 0) await processAuthQueue();
    return {inQueue: true, c};
}

export const queueCookiesLogin = async (id, cookies) => {
    if(!config.useLoginQueue) return await redeemCookies(id, cookies);
    if(useMultiqueue()) return {inQueue: false, ...await mqLoginCookies(id, cookies)};

    const c = queueCounter++;
    queue.push({
        operation: Operations.COOKIES,
        c, id, cookies
    });
    console.log(`Added cookie login to auth queue for user ${id} (c=${c})`);

    if(processingCount === 0) await processAuthQueue();
    return {inQueue: true, c};
}

export const queueNullOperation = async (timeout) => {  // used for stress-testing the auth queue
    if(!config.useLoginQueue) await wait(timeout);
    if(useMultiqueue()) return {inQueue: false, ...await mqNullOperation(timeout)}

    const c = queueCounter++;
    queue.push({
        operation: Operations.NULL,
        c, timeout
    });
    console.log(`Added null operation to auth queue with timeout ${timeout} (c=${c})`);

    if(processingCount === 0) await processAuthQueue();
    return {inQueue: true, c};
}

export const processAuthQueue = async () => {
    lastQueueProcess = Date.now();
    if(!config.useLoginQueue || !queue.length) return;
    if(useMultiqueue()) return;

    const item = queue.shift();
    console.log(`Processing auth queue item "${item.operation}" for ${item.id} (c=${item.c}, left=${queue.length})`);
    processingCount++;

    let result;
    try {
        switch (item.operation) {
            case Operations.USERNAME_PASSWORD:
                result = await redeemUsernamePassword(item.id, item.username, item.password);
                break;
            case Operations.MFA:
                result = await redeem2FACode(item.id, item.code);
                break;
            case Operations.COOKIES:
                result = await redeemCookies(item.id, item.cookies);
                break;
            case Operations.NULL:
                await wait(item.timeout);
                result = {success: true};
                break;
        }
    } catch(e) {
        result = {success: false, error: e};
    }

    queueResults.push({
        c: item.c,
        result
    });

    console.log(`Finished processing auth queue item "${item.operation}" for ${item.id} (c=${item.c})`);
    processingCount--;
}

export const getAuthQueueItemStatus = async (c) => {
    if(useMultiqueue()) return await mqGetAuthQueueItemStatus(c);

    // check if in queue
    let item = queue.find(i => i.c === c);
    if(item) return {processed: false, ...remainingAndEstimatedTimestamp(c)};

    // check if currenty processing
    const index = queueResults.findIndex(i => i.c === c);
    if(index === -1) return {processed: false, remaining: 0};

    // get result
    item = queueResults[index];
    queueResults.splice(index, 1);
    return {processed: true, result: item.result};
}

const remainingAndEstimatedTimestamp = (c) => {
    const remaining = c - queue[0].c;
    let timestamp = lastQueueProcess + ((remaining + 1) * config.loginQueueInterval);

    // UX: if the timestamp is late, even by half a second, the user gets impatient.
    // on the other hand, if it happens early, the user is happy.
    timestamp += 2000;
    timestamp = Math.round(timestamp / 1000);

    return {remaining, timestamp};
}
