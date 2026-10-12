import User from '../models/User.js';
import Position from '../models/Position.js';

export function registerOfficeSocket(io) {
  io.on('connection', (socket) => {
    let currentUserId = null;
    let currentRoomId = null;
    let lastPersistedAt = 0;

    // Client sends: { userId, roomId? }. In production, derive user identity from auth.
    socket.on('joinOffice', async ({ userId, roomId } = {}) => {
      try {
        if (!userId) return socket.emit('appError', { message: 'userId is required' });
        const user = await User.findById(userId).lean();
        if (!user) return socket.emit('appError', { message: 'User not found' });
        currentUserId = user._id.toString();
        currentRoomId = roomId || null;
        if (currentRoomId) socket.join(currentRoomId);
        await User.updateOne({ _id: currentUserId }, { $set: { status: 'online', lastSeen: new Date() } });
        const position = await Position.findOne({ userId: currentUserId }).lean();
        socket.emit('joinedOffice', { user, position });
        socket.broadcast.to(currentRoomId || 'lobby').emit('userJoined', { userId: currentUserId, username: user.username, position });
      } catch (error) { socket.emit('appError', { message: 'Could not join office' }); }
    });

    // Client sends: { x, y, direction? }. Movement is broadcast frequently; DB writes are throttled.
    socket.on('move', async ({ x, y, direction } = {}) => {
      if (!currentUserId || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
      const movement = { userId: currentUserId, roomId: currentRoomId, x, y, direction };
      io.to(currentRoomId || 'lobby').emit('avatarMoved', movement);
      const now = Date.now();
      if (now - lastPersistedAt >= 1000) {
        lastPersistedAt = now;
        const update = { x, y, roomId: currentRoomId };
        if (['up', 'down', 'left', 'right'].includes(direction)) update.direction = direction;
        Position.findOneAndUpdate({ userId: currentUserId }, { $set: update, $setOnInsert: { userId: currentUserId } }, { upsert: true, new: true }).catch(() => {});
      }
    });

    socket.on('disconnect', async () => {
      if (!currentUserId) return;
      try { await User.updateOne({ _id: currentUserId }, { $set: { status: 'offline', lastSeen: new Date() } }); }
      catch { /* disconnect cleanup should not crash the server */ }
      io.to(currentRoomId || 'lobby').emit('userLeft', { userId: currentUserId });
    });
  });
}
