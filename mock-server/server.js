
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const AVATAR_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#a855f7",
  "#eab308",
];

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      audioRadius: 100,
    });
  }

  return rooms.get(roomId);
}

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
];

app.use(
  cors({
    origin: allowedOrigins,
  })
);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.get("/", (_req, res) => {
  res.send("ProxiSpeak mock server is running.");
});

app.get("/api/rooms/:roomId/config", (req, res) => {
  const room = getRoom(req.params.roomId);

  res.json({
    audioRadius: room.audioRadius,
  });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Join a room and share avatar information.
  socket.on("avatar:join", async (payload = {}) => {
    const { username, x, y, roomId } = payload;

    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof roomId !== "string" ||
      !roomId.trim() ||
      (x !== undefined && !Number.isFinite(x)) ||
      (y !== undefined && !Number.isFinite(y))
    ) {
      socket.emit("error", {
        message:
          "Please provide a valid username, position, and room ID.",
      });
      return;
    }

    const cleanUsername = username.trim();
    const cleanRoomId = roomId.trim();
    const previousRoom = socket.data.roomId;

    // Leave the previous room if necessary.
    if (previousRoom) {
      socket.to(previousRoom).emit("avatar:left", {
        avatarId: socket.data.avatarId || socket.id,
        socketId: socket.id,
      });

      await socket.leave(previousRoom);
    }

    socket.data.avatarId = socket.id;
    socket.data.username = cleanUsername;
    socket.data.roomId = cleanRoomId;
    socket.data.x = clamp(x ?? 100, 0, 2000);
    socket.data.y = clamp(y ?? 100, 0, 1200);
    socket.data.color = getAvatarColor(socket.id);

    await socket.join(cleanRoomId);

    const existingAvatars = [];
    const roomSocketIds =
      io.sockets.adapter.rooms.get(cleanRoomId) || [];

    for (const socketId of roomSocketIds) {
      if (socketId === socket.id) continue;

      const otherSocket = io.sockets.sockets.get(socketId);
      if (!otherSocket) continue;

      existingAvatars.push(getAvatarData(otherSocket));
    }

    // Send existing users to the joining user.
    socket.emit("avatars:initial", existingAvatars);

    // Notify other users that this avatar joined.
    socket.to(cleanRoomId).emit(
      "avatar:joined",
      getAvatarData(socket)
    );

    console.log(
      `${cleanUsername} joined room "${cleanRoomId}"`
    );
  });

  // Broadcast avatar movement within the room.
  socket.on("avatar:move", (payload = {}) => {
    const { x, y } = payload;
    const roomId = socket.data.roomId;

    if (
      !roomId ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return;
    }

    socket.data.x = clamp(x, 0, 2000);
    socket.data.y = clamp(y, 0, 1200);

    socket.to(roomId).emit(
      "avatar:moved",
      getAvatarData(socket)
    );
  });

  // Relay WebRTC offers, answers, and ICE candidates.
  function relaySignal(eventName, payload, signalField) {
    const targetSocketId = payload?.tosocketId;
    const roomId = socket.data.roomId;
    const target = io.sockets.sockets.get(targetSocketId);
    const signalData = payload?.[signalField];

    if (
      !roomId ||
      typeof targetSocketId !== "string" ||
      !target ||
      target.data.roomId !== roomId ||
      !signalData ||
      typeof signalData !== "object"
    ) {
      console.warn(
        `[Signaling] Rejected ${eventName} from ${socket.id}`,
        {
          targetSocketId,
          signalField,
          hasRoom: Boolean(roomId),
          targetFound: Boolean(target),
        }
      );

      socket.emit("error", {
        message:
          `Invalid ${eventName} request: target or payload is invalid.`,
      });

      return;
    }

    // Send the signal to the intended peer only.
    io.to(targetSocketId).emit(eventName, {
      fromSocketId: socket.id,
      fromAvatarId: socket.data.avatarId || socket.id,
      [signalField]: signalData,
    });

    console.log(
      `[Signaling] ${eventName}: ${socket.id} -> ${targetSocketId}`
    );
  }

  socket.on("signal:offer", (payload) => {
    relaySignal("signal:offer", payload, "offer");
  });

  socket.on("signal:answer", (payload) => {
    relaySignal("signal:answer", payload, "answer");
  });

  socket.on("signal:ice", (payload) => {
    relaySignal("signal:ice", payload, "candidate");
  });

  // Notify peers when a user disconnects.
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId) {
      socket.to(roomId).emit("avatar:left", {
        avatarId: socket.data.avatarId || socket.id,
        socketId: socket.id,
      });
    }

    console.log("Client disconnected:", socket.id);
  });
});

function getAvatarData(socket) {
  return {
    avatarId: socket.data.avatarId || socket.id,
    socketId: socket.id,
    username: socket.data.username || "Guest",
    x: socket.data.x ?? 0,
    y: socket.data.y ?? 0,
    color: socket.data.color,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getAvatarColor(socketId) {
  let hash = 0;

  for (const char of socketId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const PORT = Number(process.env.PORT) || 5000;

httpServer.listen(PORT, () => {
  console.log(
    `ProxiSpeak mock server running at http://localhost:${PORT}`
  );
});
