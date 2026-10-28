import IORedis from 'ioredis';

let client = null;
let pubClient = null;
let subClient = null;

/**
 * Initialize Redis connection based on REDIS_URL environment variable.
 * If REDIS_URL is not set, operates in single‑instance mode (no error).
 */
export const initRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set – running without Redis (single‑instance mode).');
    return;
  }
  try {
    // Main client (optional for other uses)
    client = new IORedis(redisUrl);
    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
    await client.ping();
    console.log('[Redis] Connected (client) to', redisUrl);

    // Separate pub/sub clients for the Socket.IO adapter (recommended)
    pubClient = new IORedis(redisUrl);
    subClient = new IORedis(redisUrl);
    pubClient.on('error', (err) => console.error('[Redis] Pub error:', err.message));
    subClient.on('error', (err) => console.error('[Redis] Sub error:', err.message));
    await Promise.all([pubClient.ping(), subClient.ping()]);
    console.log('[Redis] Pub/Sub clients ready');
  } catch (err) {
    console.error('[Redis] Failed to connect to', redisUrl, ':', err.message);
    client = pubClient = subClient = null;
  }
};

/** Retrieve the active Redis client (may be null). */
export const getRedisClient = () => client;
/** Retrieve the publisher client for the Socket.IO adapter. */
export const getPubClient = () => pubClient;
/** Retrieve the subscriber client for the Socket.IO adapter. */
export const getSubClient = () => subClient;

/** Gracefully close the Redis connection if it exists. */
export const closeRedis = async () => {
  const close = async (c, name) => {
    if (c) {
      try {
        await c.quit();
        console.log(`[Redis] ${name} connection closed`);
      } catch (err) {
        console.error(`[Redis] Error during ${name} quit:`, err.message);
      }
    }
  };
  await Promise.all([
    close(client, 'client'),
    close(pubClient, 'pub'),
    close(subClient, 'sub'),
  ]);
  client = pubClient = subClient = null;
};
