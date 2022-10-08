// multiqueue is the name of the system that handles shard 0 processing everything

import {sendShardMessage} from "./shardMessage.js";
import {client} from "../discord/bot.js";
import {getShop} from "../valorant/shop.js";
import {waitForAuthQueueResponse} from "../discord/authManager.js";
import {queue2FACodeRedeem, queueCookiesLogin, queueUsernamePasswordLogin} from "../valorant/authQueue.js";
import config from "./config.js";

export const useMultiqueue = () => config.useMultiqueue && client.shard && client.shard.ids[0] !== 0;

let mqMessageId = 0;
const callbacks = {};
const setCallback = (mqid, callback) => callbacks[mqid] = callback;

export const sendMQRequest = async (type, params={}, callback=()=>{}) => {
    const message = {
        type: "mqrequest",
        mqid: `${client.shard.ids[0]}:${++mqMessageId}`,
        mqtype: type,
        params
    }

    await sendShardMessage(message);
    setCallback(mqMessageId, callback);
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

    if(!client.shard.ids.includes(parseInt(shardId))) return;
    if(!callbacks[mqid]) return;
    callbacks[mqid](message);
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
            response = await waitForAuthQueueResponse(await queueUsernamePasswordLogin(id, username, password));
            break;
        }

        case "login2fa": {
            const {id, code} = params;
            response = await waitForAuthQueueResponse(await queue2FACodeRedeem(id, code));
            break;
        }

        case "loginCookies": {
            const {id, cookies} = params;
            response = await waitForAuthQueueResponse(await queueCookiesLogin(id, cookies));
            break;
        }
    }

    await sendMQResponse(mqid, response);
}
