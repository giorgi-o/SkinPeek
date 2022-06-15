import {sendAlert, sendCredentialsExpired} from "../discord/alerts.js";
import {loadConfig} from "./config.js";
import {destroyTasks, scheduleTasks} from "../discord/bot.js";
import {addMessagesToLog} from "./logger.js";
import {loadSkinsJSON} from "../valorant/cache.js";

process.on('message', async (message) => {
    console.log(`Received shard message of type ${message.type}`);
    if(message.type === "alert") {
        await sendAlert(message.id, message.alerts, message.expires, false);
    } else if(message.type === "alertCredentialsExpired") {
        await sendCredentialsExpired(message.id, message.alert, false);
    } else if(message.type === "configReload") {
        loadConfig();
        destroyTasks();
        scheduleTasks();
    } else if(message.type === "skinsReload") {
        loadSkinsJSON();
    } else if(message.type === "logMessages") {
        addMessagesToLog(message.messages);
    }
});
