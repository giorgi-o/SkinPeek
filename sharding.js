import {ShardingManager} from "discord.js";
import {loadConfig} from "./misc/config.js";

const config = loadConfig();

const manager = new ShardingManager('./SkinPeek.js', { token: config.token });

manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));

manager.spawn();
