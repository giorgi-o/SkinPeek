import config from "./config.js";
import {escapeMarkdown} from "./util.js";
import {client} from "../discord/bot.js";
import {sendShardMessage} from "./shardMessage.js";

const messagesToLog = [];

export const oldLog = console.log;
export const oldError = console.error;

export const loadLogger = () => {
    if(!config.logToChannel) return;

    const shardString = client.shard ? `[${client.shard.ids[0]}] ` : "";

    console.log = (...args) => {
        oldLog(shardString, ...args);
        messagesToLog.push(shardString + escapeMarkdown(args.join(" ")));
    }

    console.error = (...args) => {
        oldError(shardString, ...args);
        messagesToLog.push("> " + shardString + escapeMarkdown(args.map(e => (e instanceof Error ? e.stack : e.toString()).split('\n').join('\n> ' + shardString)).join(" ")));
    }
}

export const addMessagesToLog = (messages) => {
    const channel = client.channels.cache.get(config.logToChannel);
    if(!channel) {
        //oldLog("I'm not the right shard for logging! ignoring log messages")
        return;
    }

    oldLog(`Adding ${messages.length} messages to log...`);

    messagesToLog.push(...messages);
}

export const sendConsoleOutput = () => {
    try {
        if(!client || !messagesToLog.length) return;

        const channel = client.channels.cache.get(config.logToChannel);

        if(!channel && client.shard) {
            if(messagesToLog.length > 0) sendShardMessage({
                type: "logMessages",
                messages: messagesToLog
            })
        }
        else if(channel) {
            while(messagesToLog.length) {
                let s = "";
                while(messagesToLog.length && s.length + messagesToLog[0].length < 2000)
                    s += messagesToLog.shift() + "\n";

                channel.send(s);
            }
        }

        messagesToLog.length = 0;
    } catch(e) {
        oldError("Error when trying to send the console output to the channel!");
        oldError(e)
    }
}
