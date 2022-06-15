import {ShardingManager} from "discord.js";
import {loadConfig} from "./misc/config.js";

const config = loadConfig();

const manager = new ShardingManager('./SkinPeek.js', { token: config.token });

manager.on('shardCreate', shard => {
    console.log(`Launched shard ${shard.id}`);
    shard.on('message', message => {
        sendToOtherShards(shard.id, message);
    })
});

const sendToOtherShards = (shardId, message) => {
    manager.shards.forEach(shard => {
        if(shard.id !== shardId) shard.send(message);
    });
}

manager.spawn();
