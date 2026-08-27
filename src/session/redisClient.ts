import { Redis } from "@upstash/redis";
import { getEnv } from "../config/env.js";

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    const env = getEnv();
    client = new Redis({
      url: env.REDIS_REST_URL,
      token: env.REDIS_REST_TOKEN,
    });
  }
  return client;
}
