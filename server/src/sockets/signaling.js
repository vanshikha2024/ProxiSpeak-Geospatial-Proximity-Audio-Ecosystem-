import mongoose from 'mongoose';
import User from '../models/User.js';
import Room from '../models/Room.js';
import { PERSISTENCE_THROTTLE_MS, DEFAULT_AUDIO_RADIUS } from '../config/constants.js';
import { isWithinAudioRadius } from '../utils/proximity.js';

/**
 * In-memory cache for room audio radii:
 * Map<roomId, number>
 */
export const roomAudioRadii = new Map();

/**
 * Resolves the configured audio radius for a room.
 * Uses cached room configuration, queries MongoDB if available, or falls back to DEFAULT_AUDIO_RADIUS.
 *
 * @param {string} roomId
 * @returns {Promise<number>}
 */
export const getRoomAudioRadius = async (roomId) => {
  if (!roomId) return DEFAULT_AUDIO_RADIUS;
  const strRoomId = String(roomId);
  if (roomAudioRadii.has(strRoomId)) {
    return roomAudioRadii.get(strRoomId);
  }
  if (mongoose.connection.readyState === 1) {
    try {
      const room = mongoose.isValidObjectId(strRoomId)
        ? await Room.findById(strRoomId).select('audioRadius').lean()
        : await Room.findOne({ name: strRoomId }).select('audioRadius').lean();
      if (room && Number.isFinite(room.audioRadius) && room.audioRadius > 0) {
        roomAudioRadii.set(strRoomId, room.audioRadius);
        return room.audioRadius;
      }
    } catch (err) {
      console.error(`[Signaling] Failed to resolve audio radius for room ${strRoomId}:`, err.message);
    }
  }
  return DEFAULT_AUDIO_RADIUS;
};

/**
 * In-memory registry for connected avatars:
 * Map<socketId, { socketId: string, avatarId: string, username: string, x: number, y: number, roomId: string, isOnline: boolean }>
 */
export const activeAvatars = new Map();

/**
 * Throttling state for database persistence:
 * Map<socketId, { lastSavedAt: number, timeoutId: NodeJS.Timeout | null, pendingCoords: [number, number] | null, avatarId: string }>
 */
export const persistenceState = new Map();

/**
 * Validates coordinate pair [x, y].
 *
 * @param {*} x
 * @param {*} y
 * @returns {boolean}
 */
export const areCoordinatesValid = (x, y) => {
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y);
};

/**
 * Asynchronously persists avatar coordinates to MongoDB with error logging.
 *
 * @param {string} avatarId
 * @param {[number, number]} coordinates
 */
const saveCoordinatesToDB = async (avatarId, coordinates) => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(avatarId)) {
      await User.findOneAndUpdate(
        { _id: avatarId, isOnline: true },
        { 'location.coordinates': coordinates }
      );
    }
  } catch (err) {
    console.error(`[Avatar] Failed to persist throttled coordinates for avatar ${avatarId}:`, err.message);
  }
};

/**
 * Schedules or executes throttled database persistence (at most once per second per user).
 *
 * @param {string} socketId
 * @param {string} avatarId
 * @param {[number, number]} coordinates
 */
export const persistPositionThrottled = (socketId, avatarId, coordinates) => {
  let state = persistenceState.get(socketId);
  if (!state) {
    state = {
      lastSavedAt: 0,
      timeoutId: null,
      pendingCoords: null,
      avatarId,
    };
    persistenceState.set(socketId, state);
  }

  const now = Date.now();
  const timeSinceLastSave = now - state.lastSavedAt;

  if (timeSinceLastSave >= PERSISTENCE_THROTTLE_MS) {
    // Immediate save allowed
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
    state.lastSavedAt = now;
    state.pendingCoords = null;
    saveCoordinatesToDB(avatarId, coordinates);
  } else {
    // Within throttle window: buffer latest coordinates and schedule trailing save
    state.pendingCoords = coordinates;
    if (!state.timeoutId) {
      const remainingDelay = PERSISTENCE_THROTTLE_MS - timeSinceLastSave;
      state.timeoutId = setTimeout(() => {
        const currentState = persistenceState.get(socketId);
        if (currentState && currentState.pendingCoords) {
          // If avatar has disconnected, discard pending coordinates
          if (!activeAvatars.has(socketId)) {
            currentState.pendingCoords = null;
            currentState.timeoutId = null;
            return;
          }
          currentState.lastSavedAt = Date.now();
          const coords = currentState.pendingCoords;
          currentState.pendingCoords = null;
          currentState.timeoutId = null;
          saveCoordinatesToDB(avatarId, coords);
        } else if (currentState) {
          currentState.timeoutId = null;
        }
      }, remainingDelay);
    }
  }
};

/**
 * Validates WebRTC signaling requests against server state, payload contract, room isolation, and audio proximity.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {any} payload
 * @param {'offer'|'answer'|'ice'} signalType
 * @returns {Promise<{ currentAvatar: object, targetAvatar: object, targetSocketId: string } | null>}
 */
export const validateSignalingRequest = async (io, socket, payload, signalType) => {
  // 1. Validate sender registration
  const currentAvatar = activeAvatars.get(socket.id);
  if (!currentAvatar) {
    socket.emit('error', { message: 'Avatar has not joined yet' });
    return null;
  }

  // 2. Validate payload structure
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    socket.emit('error', { message: 'Invalid signaling payload: object expected' });
    return null;
  }

  const { toSocketId } = payload;
  if (!toSocketId || typeof toSocketId !== 'string' || !toSocketId.trim()) {
    socket.emit('error', { message: 'Invalid target socket ID' });
    return null;
  }

  const cleanToSocketId = toSocketId.trim();

  // Reject self-signaling
  if (cleanToSocketId === socket.id) {
    socket.emit('error', { message: 'Cannot signal yourself' });
    return null;
  }

  // Validate signal payload shape
  if (signalType === 'offer') {
    if (!payload.offer || typeof payload.offer !== 'object' || Array.isArray(payload.offer)) {
      socket.emit('error', { message: 'Invalid signaling payload: offer object is required' });
      return null;
    }
  } else if (signalType === 'answer') {
    if (!payload.answer || typeof payload.answer !== 'object' || Array.isArray(payload.answer)) {
      socket.emit('error', { message: 'Invalid signaling payload: answer object is required' });
      return null;
    }
  } else if (signalType === 'ice') {
    if (!payload.candidate || (typeof payload.candidate !== 'object' && typeof payload.candidate !== 'string')) {
      socket.emit('error', { message: 'Invalid signaling payload: candidate is required' });
      return null;
    }
  }

  // 3. Validate target socket existence and connection
  const targetAvatar = activeAvatars.get(cleanToSocketId);
  const targetSocket = io.sockets.sockets.get(cleanToSocketId);

  if (!targetAvatar || !targetSocket || !targetSocket.connected) {
    socket.emit('error', { message: 'Target peer not found or disconnected' });
    return null;
  }

  // 4. Validate same room membership
  if (String(targetAvatar.roomId) !== String(currentAvatar.roomId)) {
    socket.emit('error', { message: 'Target peer not found in this room' });
    return null;
  }

  // 5. Validate proximity within room audio radius
  const audioRadius = await getRoomAudioRadius(currentAvatar.roomId);
  if (!isWithinAudioRadius(currentAvatar.x, currentAvatar.y, targetAvatar.x, targetAvatar.y, audioRadius)) {
    socket.emit('error', { message: 'Target peer is out of proximity audio range' });
    return null;
  }

  return {
    currentAvatar,
    targetAvatar,
    targetSocketId: cleanToSocketId,
  };
};

/**
 * Registers Socket.io signaling, avatar lifecycle, and room-scoped movement handlers.
 *
 * @param {import('socket.io').Server} io
 */
export const registerSignalingHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected | Socket ID: ${socket.id}`);

    /**
     * Client -> Server: avatar:join
     * Payload: { username: string, x: number, y: number, roomId: string, avatarUrl?: string }
     */
    socket.on('avatar:join', async (payload) => {
      try {
        const username = (payload?.username || payload?.displayName || '').trim();
        const x = payload?.x;
        const y = payload?.y;
        const rawRoomId = payload?.roomId ? String(payload.roomId).trim() : '';

        // 1. Validation
        if (!username) {
          socket.emit('error', { message: 'Username is required' });
          return;
        }

        if (!areCoordinatesValid(x, y)) {
          socket.emit('error', { message: 'Invalid coordinates: x and y must be finite numbers' });
          return;
        }

        if (!rawRoomId) {
          socket.emit('error', { message: 'Room ID is required' });
          return;
        }

        // 2. Validate room membership in MongoDB if connected
        let roomDoc = null;
        if (mongoose.connection.readyState === 1) {
          if (mongoose.isValidObjectId(rawRoomId)) {
            roomDoc = await Room.findById(rawRoomId);
          } else {
            roomDoc = await Room.findOne({ name: rawRoomId });
          }

          if (!roomDoc) {
            socket.emit('error', { message: `Room "${rawRoomId}" not found` });
            return;
          }
        }

        const effectiveRoomId = roomDoc ? roomDoc._id.toString() : rawRoomId;
        const mongoRoomId = roomDoc ? roomDoc._id : (mongoose.isValidObjectId(rawRoomId) ? rawRoomId : null);

        // Track effective room audio radius
        const effectiveRadius = (roomDoc && Number.isFinite(roomDoc.audioRadius) && roomDoc.audioRadius > 0)
          ? roomDoc.audioRadius
          : DEFAULT_AUDIO_RADIUS;
        roomAudioRadii.set(effectiveRoomId, effectiveRadius);

        // 3. Ensure distinct user identity: create a dedicated record per concurrent connection
        let user = null;
        try {
          if (mongoose.connection.readyState === 1) {
            user = await User.create({
              username,
              avatarUrl: payload?.avatarUrl || '',
              socketId: socket.id,
              roomId: mongoRoomId,
              isOnline: true,
              location: {
                type: 'Point',
                coordinates: [x, y],
              },
            });
          }
        } catch (dbError) {
          console.error(`[Avatar] MongoDB error on avatar:join for socket ${socket.id}:`, dbError.message);
        }

        const avatarId = user ? user._id.toString() : socket.id;

        const avatarData = {
          avatarId,
          socketId: socket.id,
          username,
          x,
          y,
          roomId: effectiveRoomId,
          isOnline: true,
        };

        // 4. Join Socket.io room channel
        socket.join(effectiveRoomId);

        // 5. Update in-memory registry
        activeAvatars.set(socket.id, avatarData);
        socket.data.avatar = avatarData;

        // Initialize throttle persistence state
        persistenceState.set(socket.id, {
          lastSavedAt: Date.now(),
          timeoutId: null,
          pendingCoords: null,
          avatarId,
        });

        // 6. Confirm joining to the client
        socket.emit('avatar:joined', avatarData);

        // 7. Send room-scoped initial avatar list (ONLY avatars in the same room)
        const roomAvatars = Array.from(activeAvatars.values()).filter(
          (a) => String(a.roomId) === String(effectiveRoomId)
        );
        socket.emit('avatars:initial', roomAvatars);

        // 8. Broadcast newcomer ONLY to other clients in the same room
        socket.to(effectiveRoomId).emit('avatar:joined', avatarData);

        console.log(`[Avatar] Avatar joined: "${username}" (${avatarId}) in room "${effectiveRoomId}" at [${x}, ${y}]`);
      } catch (err) {
        console.error(`[Avatar] Unexpected error handling avatar:join:`, err.message);
        socket.emit('error', { message: 'Internal server error while joining' });
      }
    });

    /**
     * Client -> Server: avatar:move
     * Payload: { x: number, y: number }
     */
    socket.on('avatar:move', (payload) => {
      try {
        const currentAvatar = activeAvatars.get(socket.id);
        if (!currentAvatar) {
          socket.emit('error', { message: 'Avatar has not joined yet' });
          return;
        }

        const { x, y } = payload || {};
        if (!areCoordinatesValid(x, y)) {
          socket.emit('error', { message: 'Invalid coordinates: x and y must be finite numbers' });
          return;
        }

        // 1. Immediately update in-memory coordinates
        currentAvatar.x = x;
        currentAvatar.y = y;

        // 2. Broadcast updated position ONLY to other occupants in the same room (no self-echo)
        const movePayload = {
          avatarId: currentAvatar.avatarId,
          socketId: socket.id,
          username: currentAvatar.username,
          x,
          y,
          roomId: currentAvatar.roomId,
        };

        socket.to(currentAvatar.roomId).emit('avatar:moved', movePayload);

        // 3. Throttled MongoDB persistence (max once per second per user)
        persistPositionThrottled(socket.id, currentAvatar.avatarId, [x, y]);
      } catch (err) {
        console.error(`[Avatar] Unexpected error handling avatar:move:`, err.message);
        socket.emit('error', { message: 'Internal server error while moving' });
      }
    });

    /**
     * Client -> Server: signal:offer (Secure WebRTC Signaling Relay)
     * Payload: { toSocketId: string, offer: any }
     */
    socket.on('signal:offer', async (payload) => {
      try {
        const validated = await validateSignalingRequest(io, socket, payload, 'offer');
        if (!validated) return;

        io.to(validated.targetSocketId).emit('signal:offer', {
          fromSocketId: socket.id,
          fromAvatarId: validated.currentAvatar.avatarId,
          offer: payload.offer,
        });
      } catch (err) {
        console.error(`[Signaling] Error in signal:offer:`, err.message);
        socket.emit('error', { message: 'Internal server error during signaling offer' });
      }
    });

    /**
     * Client -> Server: signal:answer (Secure WebRTC Signaling Relay)
     * Payload: { toSocketId: string, answer: any }
     */
    socket.on('signal:answer', async (payload) => {
      try {
        const validated = await validateSignalingRequest(io, socket, payload, 'answer');
        if (!validated) return;

        io.to(validated.targetSocketId).emit('signal:answer', {
          fromSocketId: socket.id,
          fromAvatarId: validated.currentAvatar.avatarId,
          answer: payload.answer,
        });
      } catch (err) {
        console.error(`[Signaling] Error in signal:answer:`, err.message);
        socket.emit('error', { message: 'Internal server error during signaling answer' });
      }
    });

    /**
     * Client -> Server: signal:ice (Secure WebRTC Signaling Relay)
     * Payload: { toSocketId: string, candidate: any }
     */
    socket.on('signal:ice', async (payload) => {
      try {
        const validated = await validateSignalingRequest(io, socket, payload, 'ice');
        if (!validated) return;

        io.to(validated.targetSocketId).emit('signal:ice', {
          fromSocketId: socket.id,
          fromAvatarId: validated.currentAvatar.avatarId,
          candidate: payload.candidate,
        });
      } catch (err) {
        console.error(`[Signaling] Error in signal:ice:`, err.message);
        socket.emit('error', { message: 'Internal server error during signaling ice' });
      }
    });

    /**
     * Socket disconnect handling: cleans up in-memory registry, flushes final state, notifies room.
     */
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.io] Client disconnected | Socket ID: ${socket.id} | Reason: ${reason}`);

      const avatar = activeAvatars.get(socket.id);

      // Clean up throttling timers
      const throttle = persistenceState.get(socket.id);
      if (throttle) {
        if (throttle.timeoutId) {
          clearTimeout(throttle.timeoutId);
          throttle.timeoutId = null;
        }
        persistenceState.delete(socket.id);
      }

      if (avatar) {
        // Clean up in-memory registry
        activeAvatars.delete(socket.id);

        // Persist final position and offline status to MongoDB
        try {
          if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(avatar.avatarId)) {
            await User.findByIdAndUpdate(avatar.avatarId, {
              'location.coordinates': [avatar.x, avatar.y],
              isOnline: false,
              socketId: null,
            });
          }
        } catch (dbError) {
          console.error(`[Avatar] MongoDB error on disconnect for avatarId ${avatar.avatarId}:`, dbError.message);
        }

        // Broadcast removal ONLY to remaining clients in the same room
        io.to(avatar.roomId).emit('avatar:left', {
          avatarId: avatar.avatarId,
          socketId: socket.id,
          username: avatar.username,
          roomId: avatar.roomId,
        });

        console.log(`[Avatar] Avatar left: "${avatar.username}" (${avatar.avatarId}) from room "${avatar.roomId}"`);
      }
    });
  });
};
