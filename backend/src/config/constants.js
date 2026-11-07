/**
 * ProxiSpeak Server-Side Constants
 * Single source of truth for proximity audio, virtual office dimensions, and persistence limits.
 */

// Default audio attenuation radius in 2D Euclidean canvas units (pixels)
export const DEFAULT_AUDIO_RADIUS = 100;

// Default canvas bounds for virtual office room
export const DEFAULT_ROOM_WIDTH = 1920;
export const DEFAULT_ROOM_HEIGHT = 1080;
export const DEFAULT_ROOM_CAPACITY = 300;

// Default avatar entry coordinates within room canvas
export const DEFAULT_SPAWN_X = 0;
export const DEFAULT_SPAWN_Y = 0;

// Persistence throttle in milliseconds for avatar movement writes to MongoDB
export const PERSISTENCE_THROTTLE_MS = 1000;
