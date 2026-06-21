// ============================================================================
//  Redis client — SERVER ONLY.
//  Single lazy singleton; avoids connection leaks on Next.js dev hot reload.
// ============================================================================
import "server-only";
import { createClient } from "redis";

// Derive the client type from buildClient so it reflects the exact options we
// pass (node-redis v6 narrows the type by RESP version etc.). Deriving from a
// bare `createClient` instead would default to a different RESP version and
// fail to match.
type RedisClient = ReturnType<typeof buildClient>;

declare global {
  var __redisClient: RedisClient | undefined;
  var __redisConnectPromise: Promise<RedisClient> | undefined;
}

function buildClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL. See .env.local");
  }

  const client = createClient({
    url,
    disableClientInfo: true,
    socket: {
      connectTimeout: 30000,
      // Avoid reconnect storms in dev — free tier allows only 30 connections.
      reconnectStrategy:
        process.env.NODE_ENV === "production"
          ? (retries) => (retries > 10 ? false : Math.min(retries * 100, 3000))
          : false,
    },
  });

  client.on("error", (err) => {
    console.error("[redis] client error:", err);
  });

  return client;
}

/** Reuse one client across hot reloads / serverless invocations. */
export function getRedisClient(): RedisClient {
  if (!global.__redisClient) {
    global.__redisClient = buildClient();
  }
  return global.__redisClient;
}

/** Returns a connected client; connects lazily on first call. */
export async function getConnectedRedisClient(): Promise<RedisClient> {
  const client = getRedisClient();
  if (client.isOpen) {
    return client;
  }

  if (!global.__redisConnectPromise) {
    global.__redisConnectPromise = client.connect().then(() => client);
    try {
      return await global.__redisConnectPromise;
    } catch (err) {
      global.__redisClient = undefined;
      if (client.isOpen) await client.disconnect().catch(() => {});
      throw err;
    } finally {
      global.__redisConnectPromise = undefined;
    }
  }

  return global.__redisConnectPromise;
}
