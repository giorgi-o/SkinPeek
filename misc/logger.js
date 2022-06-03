import config from "./config.js";
import {escapeMarkdown} from "./util.js";

const oldLog = console.log;
const oldError = console.error;

let client;
export const setClient = (c) => {
    client = c;
}

const messagesToLog = [];

console.log = (...args) => {
    oldLog(...args);
    if(config.logToChannel) messagesToLog.push(escapeMarkdown(args.join(" ")));
}

console.error = (...args) => {
    oldError(...args);
    if(config.logToChannel) messagesToLog.push("> " + escapeMarkdown(args.map(e => e instanceof Error ? e.stack : e.toString().split('\n').join('\n> ')).join(" ")));
}

export const sendConsoleOutput = () => {
    try {
        if(!client || !messagesToLog.length) return;

        const channel = client.channels.cache.get(config.logToChannel);
        if(!channel) return;

        while(messagesToLog.length) {
            let s = "";
            while(messagesToLog.length && s.length + messagesToLog[0].length < 2000)
                s += messagesToLog.shift() + "\n";

            channel.send(s);
        }

        messagesToLog.length = 0;
    } catch(e) {
        oldError("Error when trying to send the console output to the channel!");
        oldError(e)
    }
}
