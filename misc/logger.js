import config from "./config.js";
import {escapeMarkdown} from "./util.js";
import {client} from "../discord/bot.js";

const messagesToLog = [];

const oldLog = console.log;
const oldError = console.error;

export const loadLogger = () => {
    if(!config.logToChannel) return;

    const shardString = client.shard ? `[${client.shard.ids[0]}] ` : "";

    console.log = (...args) => {
        oldLog(...args);
        messagesToLog.push(escapeMarkdown(args.join(" ")));
    }

    console.error = (...args) => {
        oldError(...args);
        messagesToLog.push("> " + shardString + escapeMarkdown(args.map(e => (e instanceof Error ? e.stack : e.toString()).split('\n').join('\n> ' + shardString)).join(" ")));
    }
}

export const addMessagesToLog = (messages) => {
    messagesToLog.push(...messages);
}

export const sendConsoleOutput = () => {
    try {
        if(!client || !messagesToLog.length) return;

        const channel = client.channels.cache.get(config.logToChannel);

        if(!channel && client.shard) {
            client.shard.send({
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
