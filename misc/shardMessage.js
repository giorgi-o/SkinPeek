import {checkAlerts, sendAlert, sendCredentialsExpired, sendDailyShop} from "../discord/alerts.js";
import {loadConfig} from "./config.js";
import {client, destroyTasks, scheduleTasks} from "../discord/bot.js";
import {addMessagesToLog, localLog} from "./logger.js";
import {loadSkinsJSON} from "../valorant/cache.js";
import {handleMQRequest, handleMQResponse} from "./multiqueue.js";

let allShardsReadyCb;
let allShardsReadyPromise = new Promise(r => allShardsReadyCb = r);

export const areAllShardsReady = () => {
    return !client.shard || allShardsReadyPromise === null;
}

export const sendShardMessage = async (message) => {
    if(!client.shard) return;

    await allShardsReadyPromise;

    if(message.type !== "logMessages") localLog(`Sending message to other shards: ${JSON.stringify(message).substring(0, 100)}`);

    // I know this is a weird way of doing this, but trust me
    // client.shard.send() did not want to work for the life of me
    // and this solution seems to work, so should be fine lol
    await client.shard.broadcastEval((client, context) => {
        client.skinPeekShardMessageReceived(context.message);
    }, {context: {message}});
}

const receiveShardMessage = async (message) => {
    //oldLog(`Received shard message ${JSON.stringify(message).substring(0, 100)}`);
    switch(message.type) {
        case "shardsReady":
            // also received when a shard dies and respawns
            if(allShardsReadyPromise === null) return;

            localLog(`All shards are ready!`);
            allShardsReadyPromise = null;
            allShardsReadyCb();
            break;
        case "mqrequest":
            await handleMQRequest(message);
            break;
        case "mqresponse":
            await handleMQResponse(message);
            break;
        case "alert":
            await sendAlert(message.id, message.account, message.alerts, message.expires, false, message.alertsLength);
            break;
        case "dailyShop":
            await sendDailyShop(message.id, message.shop, message.channelId, message.valorantUser, false);
            break;
        case "credentialsExpired":
            await sendCredentialsExpired(message.id, message.alert, false);
            break;
        case "checkAlerts":
            await checkAlerts();
            break;
        case "configReload":
            loadConfig();
            destroyTasks();
            scheduleTasks();
            break;
        case "skinsReload":
            await loadSkinsJSON();
            break;
        case "logMessages":
            addMessagesToLog(message.messages);
            break;
        case "processExit":
            process.exit();
            break;
    }
};

setTimeout(() => client.skinPeekShardMessageReceived = receiveShardMessage);
