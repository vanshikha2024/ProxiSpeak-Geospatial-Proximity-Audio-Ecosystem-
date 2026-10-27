import { DEFAULT_AUDIO_RADIUS } from '../config/constants.js';

/**
 * Calculates the 2D Euclidean distance between two planar points (x1, y1) and (x2, y2).
 * Formula: sqrt((x2 - x1)^2 + (y2 - y1)^2)
 *
 * @param {number} x1 Origin X coordinate
 * @param {number} y1 Origin Y coordinate
 * @param {number} x2 Target X coordinate
 * @param {number} y2 Target Y coordinate
 * @returns {number} Euclidean distance in pixels
 */
export const calculateEuclideanDistance = (x1, y1, x2, y2) => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

/**
 * Determines whether a target point is within the permitted proximity audio radius of an origin point.
 * Handles the exact radius boundary consistently (distance <= radius).
 *
 * @param {number} x1 Origin X coordinate
 * @param {number} y1 Origin Y coordinate
 * @param {number} x2 Target X coordinate
 * @param {number} y2 Target Y coordinate
 * @param {number} radius Audio radius threshold
 * @returns {boolean} True if distance <= radius, false otherwise
 */
export const isWithinAudioRadius = (x1, y1, x2, y2, radius) => {
  if (!Number.isFinite(radius) || radius <= 0) {
    return false;
  }
  const distance = calculateEuclideanDistance(x1, y1, x2, y2);
  return distance <= radius;
};

/**
 * Resolves the effective audio radius using the room's configured audioRadius as the source of truth.
 * Falls back to DEFAULT_AUDIO_RADIUS when room config is missing or unassigned.
 *
 * @param {object|null} room Room document or object with audioRadius property
 * @param {number|null} [requestedRadius] Optional fallback radius when no room is specified
 * @returns {number} Effective audio radius
 */
export const getEffectiveAudioRadius = (room, requestedRadius = null) => {
  if (room && Number.isFinite(room.audioRadius) && room.audioRadius > 0) {
    return room.audioRadius;
  }
  if (Number.isFinite(requestedRadius) && requestedRadius > 0) {
    return requestedRadius;
  }
  return DEFAULT_AUDIO_RADIUS;
};
