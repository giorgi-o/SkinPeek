// multiqueue is the name of the system that handles shard 0 processing everything

import {sendShardMessage} from "./shardMessage.js";
import {client} from "../discord/bot.js";
import {getShop} from "../valorant/shop.js";
import {
    getAuthQueueItemStatus,
    queue2FACodeRedeem,
    queueCookiesLogin, queueNullOperation,
    queueUsernamePasswordLogin
} from "../valorant/authQueue.js";
import config from "./config.js";

export const useMultiqueue = () => config.useMultiqueue && client.shard && client.shard.ids[0] !== 0;

let mqMessageId = 0;
const callbacks = {};
const setCallback = (mqid, callback) => callbacks[parseInt(mqid)] = callback;

export const sendMQRequest = async (type, params={}, callback=()=>{}) => {
    const message = {
        type: "mqrequest",
        mqid: `${client.shard.ids[0]}:${++mqMessageId}`,
        mqtype: type,
        params
    }

    setCallback(mqMessageId, callback);
    await sendShardMessage(message);
}

export const sendMQResponse = async (mqid, params={}) => {
    const message = {
        type: "mqresponse",
        mqid,
        params
    }

    await sendShardMessage(message);
}

export const handleMQRequest = async (message) => {
    if(!client.shard.ids.includes(0)) return;

    await mqProcessRequest(message);
}

export const handleMQResponse = async (message) => {
    const [shardId, mqid] = message.mqid.split(":");

    // check the response is intended for this shard
    if(!client.shard.ids.includes(parseInt(shardId))) return;

    // check we have a callback registered
    if(!callbacks[mqid]) return console.error(`No callback registered for MQ response ${message.mqid}!`);

    // do the thing
    callbacks[mqid](message);
    delete callbacks[mqid];
}


// =====================

const mqSendMessage  = async (type, params={}) => {
    return new Promise((resolve, reject) => {
        sendMQRequest(type, params, (message) => {
            if(message.error) reject(message.error);
            else resolve(message.params);
        });
    });
}

export const mqGetShop = async (id, account=null) => await mqSendMessage("getShop", {id, account});
export const mqLoginUsernamePass = async (id, username, password) => await mqSendMessage("loginUsernamePass", {id, username, password});
export const mqLogin2fa = async (id, code) => await mqSendMessage("login2fa", {id, code});
export const mqLoginCookies = async (id, cookies) => await mqSendMessage("loginCookies", {id, cookies});
export const mqNullOperation = async (timeout) => await mqSendMessage("nullOperation", {timeout});
export const mqGetAuthQueueItemStatus = async (c) => await mqSendMessage("getAuthQueueItemStatus", {c});


const mqProcessRequest = async ({mqid, mqtype, params}) => {
    console.log("Processing MQ request", mqid, mqtype, JSON.stringify(params).substring(0, 200));

    let response;
    switch(mqtype) {
        case "getShop": {
            const {id, account} = params;
            response = await getShop(id, account);
            break;
        }

        case "loginUsernamePass": {
            const {id, username, password} = params;
            response = await queueUsernamePasswordLogin(id, username, password);
            break;
        }

        case "login2fa": {
            const {id, code} = params;
            response = await queue2FACodeRedeem(id, code);
            break;
        }

        case "loginCookies": {
            const {id, cookies} = params;
            response = await queueCookiesLogin(id, cookies);
            break;
        }

        case "nullOperation": {
            const {timeout} = params;
            response = await queueNullOperation(timeout);
            break;
        }

        case "getAuthQueueItemStatus": {
            const {c} = params;
            response = await getAuthQueueItemStatus(c);
            break;
        }
    }

    await sendMQResponse(mqid, response);
}
