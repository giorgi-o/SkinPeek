import {checkAlerts, sendAlert, sendCredentialsExpired} from "../discord/alerts.js";
import {loadConfig} from "./config.js";
import {client, destroyTasks, scheduleTasks} from "../discord/bot.js";
import {addMessagesToLog, oldLog} from "./logger.js";
import {loadSkinsJSON} from "../valorant/cache.js";

let allShardsReadyPromise;

export const sendShardMessage = async (message) => {
    if(!client.shard) return;

    // if all shards are not ready yet, discord.js will throw an error
    if(allShardsReadyPromise !== null) {
        oldLog(`Waiting for all shards to be ready before sending message ${JSON.stringify(message).substring(0, 100)}`);

        if(allShardsReadyPromise === undefined) {
            let resolveFunction;
            allShardsReadyPromise = new Promise(resolve => resolveFunction = resolve);

            // assume this shard just became ready
            const totalShards = client.shard.count;
            const thisShardId = client.shard.ids[0];
            const shardsLeft = totalShards - thisShardId - 1;

            setTimeout(() => {
                oldLog("Ok, I'm assuming all shards are ready now...");
                allShardsReadyPromise = null;
                resolveFunction();
            }, shardsLeft * 30_000);
        }

        await allShardsReadyPromise;
    }

    oldLog(`Sending message to other shards: ${JSON.stringify(message).substring(0, 100)}`);

    // I know this is a weird way of doing this, but trust me
    // client.shard.send() did not want to work for the life of me
    // and this solution seems to work, so should be fine lol
    client.shard.broadcastEval((client, context) => {
        client.skinPeekShardMessageReceived(context.message);
    }, {context: {message}});
}

const receiveShardMessage = async (message) => {
    //oldLog(`Received shard message ${JSON.stringify(message).substring(0, 100)}`);
    if(message.type === "alert") {
        await sendAlert(message.id, message.account, message.alerts, message.expires, false);
    } else if(message.type === "alertCredentialsExpired") {
        await sendCredentialsExpired(message.id, message.alert, false);
    } else if(message.type === "checkAlerts") {
        await checkAlerts();
    } else if(message.type === "configReload") {
        loadConfig();
        destroyTasks();
        scheduleTasks();
    } else if(message.type === "skinsReload") {
        loadSkinsJSON();
    } else if(message.type === "logMessages") {
        addMessagesToLog(message.messages);
    }
};

setTimeout(() => client.skinPeekShardMessageReceived = receiveShardMessage, 1000);
