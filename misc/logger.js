import config from "./config.js";
import {escapeMarkdown} from "discord.js";
import {client} from "../discord/bot.js";
import {sendShardMessage} from "./shardMessage.js";

const messagesToLog = [];

const oldLog = console.log;
const oldError = console.error;

const shardString = () => client.shard ? `[${client.shard.ids[0]}] ` : "";
export const localLog = (...args) => oldLog(shardString(), ...args);
export const localError = (...args) => oldError(shardString(), ...args);

export const loadLogger = () => {
    console.log = (...args) => {
        oldLog(shardString(), ...args);
        if(config.logToChannel) messagesToLog.push(shardString() + escapeMarkdown(args.join(" ")));
    }

    console.error = (...args) => {
        oldError(shardString(), ...args);
        if(config.logToChannel) messagesToLog.push("> " + shardString() + escapeMarkdown(args.map(e => (e instanceof Error ? e.stack : e.toString()).split('\n').join('\n> ' + shardString())).join(" ")));
    }
}

export const addMessagesToLog = (messages) => {
    if(!messages.length) return;

    const channel = client.channels.cache.get(config.logToChannel);
    if(!channel) {
        // localLog("I'm not the right shard for logging! ignoring log messages")
        return;
    }

    // localLog(`Adding ${messages.length} messages to log...`);

    messagesToLog.push(...messages);
}

export const sendConsoleOutput = () => {
    try {
        if(!client || client.destroyed || !messagesToLog.length) return;

        const channel = client.channels.cache.get(config.logToChannel);

        if(!channel && client.shard) {
            if(messagesToLog.length > 0) sendShardMessage({
                type: "logMessages",
                messages: [...messagesToLog]
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
        localError("Error when trying to send the console output to the channel!");
        localError(e)
    }
}
