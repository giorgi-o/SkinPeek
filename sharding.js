import {ShardingManager} from "discord.js";
import {loadConfig} from "./misc/config.js";

const config = loadConfig();

const manager = new ShardingManager('./SkinPeek.js', {
    token: config.token,
    mode: "worker"
});

let allShardsReady = false;
const sendAllShardsReady = () => {
    manager.broadcastEval((client) => client.skinPeekShardMessageReceived({type: "shardsReady"}));
}

console.log("[Shards] Starting spawn");
manager.on("shardCreate", (shard) => {
    console.log(`[Shard ${shard.id}] Spawned`);

    shard.on("death", () => {
        console.log(`[Shard ${shard.id}] Died`);
    });

    shard.on("disconnect", (error, id) => {
        console.log(`[Shard ${id}] Discord Websocket Disconnected`);
        process.exit(1);
    });

    if(allShardsReady) {
        // this shard was respawned, tell it that all shards are ready
        console.log("[Shards] Sending shardsReady to respawned shard (waiting for it to be ready)");
        // shard.on("ready", sendAllShardsReady);
        shard.on("ready", () => {
            console.log(`[Shard ${shard.id}] Ready`);
            sendAllShardsReady();
        });
    }

    shard.on("disconnect", () => console.log(`[Shard ${shard.id}] Disconnected`));
    shard.on("reconnecting", () => console.log(`[Shard ${shard.id}] Reconnecting`));
    shard.on("message", (message) => {
        // console.log(`[Shard ${shard.id}] Message: ${JSON.stringify(message)}`);
        if(message === "shardReady" && allShardsReady) sendAllShardsReady();
    });
});

manager.spawn({
    timeout: config.shardReadyTimeout,
}).then(() => {
    allShardsReady = true;
    sendAllShardsReady();
});
