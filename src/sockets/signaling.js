import mongoose from 'mongoose';
import User from '../models/User.js';
import Room from '../models/Room.js';
import { PERSISTENCE_THROTTLE_MS } from '../config/constants.js';

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
      await User.findByIdAndUpdate(avatarId, {
        'location.coordinates': coordinates,
      });
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
     * Client -> Server: signal:offer (Reserved Week 2 WebRTC Signaling Relay)
     * Payload: { toSocketId: string, offer: any }
     */
    socket.on('signal:offer', (payload) => {
      const currentAvatar = activeAvatars.get(socket.id);
      if (!currentAvatar) {
        socket.emit('error', { message: 'Avatar has not joined yet' });
        return;
      }

      const { toSocketId, offer } = payload || {};
      const targetAvatar = activeAvatars.get(toSocketId);

      if (!targetAvatar || String(targetAvatar.roomId) !== String(currentAvatar.roomId)) {
        socket.emit('error', { message: 'Target peer not found in this room' });
        return;
      }

      io.to(toSocketId).emit('signal:offer', {
        fromSocketId: socket.id,
        fromAvatarId: currentAvatar.avatarId,
        offer,
      });
    });

    /**
     * Client -> Server: signal:answer (Reserved Week 2 WebRTC Signaling Relay)
     * Payload: { toSocketId: string, answer: any }
     */
    socket.on('signal:answer', (payload) => {
      const currentAvatar = activeAvatars.get(socket.id);
      if (!currentAvatar) {
        socket.emit('error', { message: 'Avatar has not joined yet' });
        return;
      }

      const { toSocketId, answer } = payload || {};
      const targetAvatar = activeAvatars.get(toSocketId);

      if (!targetAvatar || String(targetAvatar.roomId) !== String(currentAvatar.roomId)) {
        socket.emit('error', { message: 'Target peer not found in this room' });
        return;
      }

      io.to(toSocketId).emit('signal:answer', {
        fromSocketId: socket.id,
        fromAvatarId: currentAvatar.avatarId,
        answer,
      });
    });

    /**
     * Client -> Server: signal:ice (Reserved Week 2 WebRTC Signaling Relay)
     * Payload: { toSocketId: string, candidate: any }
     */
    socket.on('signal:ice', (payload) => {
      const currentAvatar = activeAvatars.get(socket.id);
      if (!currentAvatar) {
        socket.emit('error', { message: 'Avatar has not joined yet' });
        return;
      }

      const { toSocketId, candidate } = payload || {};
      const targetAvatar = activeAvatars.get(toSocketId);

      if (!targetAvatar || String(targetAvatar.roomId) !== String(currentAvatar.roomId)) {
        socket.emit('error', { message: 'Target peer not found in this room' });
        return;
      }

      io.to(toSocketId).emit('signal:ice', {
        fromSocketId: socket.id,
        fromAvatarId: currentAvatar.avatarId,
        candidate,
      });
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
