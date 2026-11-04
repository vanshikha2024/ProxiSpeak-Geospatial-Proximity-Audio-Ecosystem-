import mongoose from 'mongoose';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Room from '../models/Room.js';

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const SAVE_INTERVAL_MS = 1000;

export function registerOfficeSocket(io) {
  io.on('connection', (socket) => {
    let currentUserId = null;
    let currentRoomId = null;
    let lastPersistedAt = 0;
    let pendingMovement = null;
    let persistTimer = null;

    const emitError = (message) => socket.emit('appError', { message });
    async function persistLatestMovement() {
      if (!currentUserId || !pendingMovement) return;
      const movement = pendingMovement;
      pendingMovement = null;
      try {
        await Position.findOneAndUpdate(
          { userId: currentUserId },
          { $set: { ...movement, lastUpdated: new Date() }, $setOnInsert: { userId: currentUserId } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        lastPersistedAt = Date.now();
      } catch (error) {
        console.error('[socket] position persistence failed:', error.message);
        emitError('Movement was broadcast but could not be saved.');
      }
    }

    socket.on('joinOffice', async ({ userId, roomId = null } = {}) => {
      try {
        if (!mongoose.isValidObjectId(userId)) return emitError('A valid userId is required.');
        if (roomId !== null && !mongoose.isValidObjectId(roomId)) return emitError('Invalid roomId.');
        const user = await User.findById(userId).lean();
        if (!user) return emitError('User not found.');
        if (roomId && !(await Room.exists({ _id: roomId }))) return emitError('Room not found.');
        if (currentRoomId) socket.leave(currentRoomId);
        currentUserId = user._id.toString();
        currentRoomId = roomId ? roomId.toString() : null;
        if (currentRoomId) socket.join(currentRoomId);
        await User.updateOne({ _id: currentUserId }, { $set: { status: 'online', lastSeen: new Date() } });
        const position = await Position.findOne({ userId: currentUserId }).lean();
        socket.emit('joinedOffice', { user, position, roomId: currentRoomId });
        socket.to(currentRoomId || 'lobby').emit('userJoined', { userId: currentUserId, username: user.username, position });
      } catch (error) {
        console.error('[socket] joinOffice failed:', error.message);
        emitError('Could not join office.');
      }
    });

    socket.on('move', async ({ x, y, direction, isMoving = true } = {}) => {
      if (!currentUserId) return emitError('Join an office before moving.');
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || typeof isMoving !== 'boolean') return emitError('Movement coordinates or state are invalid.');
      if (direction !== undefined && !DIRECTIONS.has(direction)) return emitError('Invalid movement direction.');
      try {
        if (currentRoomId) {
          const room = await Room.findById(currentRoomId).select('width height').lean();
          if (!room) return emitError('Current room no longer exists.');
          if (x > room.width || y > room.height) return emitError('Movement is outside room boundaries.');
        }
        const movement = { userId: currentUserId, roomId: currentRoomId, x, y, isMoving };
        if (direction) movement.direction = direction;
        io.to(currentRoomId || 'lobby').emit('avatarMoved', movement);
        pendingMovement = { x, y, roomId: currentRoomId, isMoving, ...(direction ? { direction } : {}) };
        const remaining = Math.max(0, SAVE_INTERVAL_MS - (Date.now() - lastPersistedAt));
        if (!persistTimer && remaining === 0) await persistLatestMovement();
        else if (!persistTimer) {
          persistTimer = setTimeout(async () => {
            persistTimer = null;
            await persistLatestMovement();
          }, remaining);
        }
      } catch (error) {
        console.error('[socket] movement failed:', error.message);
        emitError('Could not process movement.');
      }
    });

    socket.on('disconnect', async () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = null;
      await persistLatestMovement();
      if (!currentUserId) return;
      try {
        // Multi-tab and multi-instance presence should be backed by active socket tracking in production.
        await User.updateOne({ _id: currentUserId }, { $set: { status: 'offline', lastSeen: new Date() } });
      } catch (error) {
        console.error('[socket] disconnect cleanup failed:', error.message);
      }
      socket.to(currentRoomId || 'lobby').emit('userLeft', { userId: currentUserId });
    });
  });
}
