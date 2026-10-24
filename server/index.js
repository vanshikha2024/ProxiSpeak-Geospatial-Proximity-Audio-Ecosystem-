const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const User = require("./models/User");
const positionSaver = require("./services/positionSaver");
const { parseNearbyParams } = require("./services/proximity");

const app = express();
const server = http.createServer(app);

// Development mode: Vite may choose 5173, 5174, 5175, etc.
app.use(cors({ origin: true }));

app.get("/", (_req, res) => {
  res.send("ProxiSpeak server is running!");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ProxiSpeak server" });
});

// Who is close to a point? Example:
//   /api/users/nearby?roomId=main-office&x=200&y=150&radius=100
app.get("/api/users/nearby", async (req, res) => {
  const params = parseNearbyParams(req.query);
  if (params.error) return res.status(400).json({ error: params.error });

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database is not connected" });
  }

  try {
    const people = await User.findNearby(params.roomId, params.point, params.radius);
    res.json({
      count: people.length,
      users: people.map((person) => ({
        username: person.username,
        x: person.location.coordinates[0],
        y: person.location.coordinates[1],
      })),
    });
  } catch (error) {
    console.error("Nearby query failed:", error.message);
    res.status(500).json({ error: "Nearby query failed" });
  }
});

const io = new Server(server, {
  cors: { origin: true },
});

// All connected users who have joined an office.
// Map of socket id -> { id, name, room, x, y }
const users = new Map();

const DEFAULT_ROOM = "main-office";

// People hear each other within 100 px (the browser connects at 100 and
// disconnects at 120). The server allows signaling up to 150 px, which
// leaves room for small network delays between the browsers.
const SIGNAL_MAX_DISTANCE = 150;

// Clean text that comes from the browser (never trust it).
function cleanName(value) {
  const name = String(value || "").trim().slice(0, 20);
  return name || "Guest";
}

function cleanRoom(value) {
  const room = String(value || "").trim().slice(0, 30);
  // Only letters, numbers, "-" and "_" are allowed in a room id.
  return /^[\w-]+$/.test(room) ? room : DEFAULT_ROOM;
}

// Everyone in ONE room.
function usersInRoom(room) {
  return Array.from(users.values()).filter((user) => user.room === room);
}

// Send the user list to everybody in a room (and nobody else).
function broadcastRoom(room) {
  io.to(room).emit("users:update", usersInRoom(room));
}

// Remove a user from their room and tell the others.
function removeUser(socket) {
  const user = users.get(socket.id);
  if (!user) return;

  users.delete(socket.id);
  positionSaver.leave(socket.id);
  socket.leave(user.room);
  broadcastRoom(user.room);
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // The browser sends this after the person typed a name and room.
  socket.on("user:join", (data) => {
    removeUser(socket); // in case they were already in another room

    const room = cleanRoom(data && data.roomId);
    const name = cleanName(data && data.username);

    // Spread new users out a little so they do not stand on each other.
    const count = usersInRoom(room).length;
    const x = 100 + (count % 8) * 60;
    const y = 100 + Math.floor(count / 8) * 60;

    users.set(socket.id, { id: socket.id, name, room, x, y });
    positionSaver.join(socket.id, { username: name, roomId: room, x, y });
    socket.join(room);
    broadcastRoom(room);
    console.log(`${name} joined room "${room}"`);
  });

  socket.on("position:update", (position) => {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) return;

    const user = users.get(socket.id);
    if (!user) return; // ignore people who have not joined

    user.x = Math.max(18, Math.min(702, position.x));
    user.y = Math.max(18, Math.min(402, position.y));
    positionSaver.moved(socket.id, user.x, user.y);
    broadcastRoom(user.room);
  });

  // ---------- WebRTC signaling ----------
  // Browsers cannot find each other alone. They send small "signal"
  // messages (offer, answer, ICE candidate) to the server and the server
  // passes each message to the person it is meant for.
  // The audio itself NEVER goes through the server (peer-to-peer).
  const SIGNALS = [
    ["signal:offer", "offer"],
    ["signal:answer", "answer"],
    ["signal:ice", "candidate"],
  ];

  SIGNALS.forEach(([eventName, key]) => {
    socket.on(eventName, (data) => {
      if (!data || typeof data.to !== "string") return;

      const sender = users.get(socket.id);
      const target = users.get(data.to);

      // Only people who joined the SAME room may talk to each other.
      if (!sender || !target || sender.room !== target.room) return;

      // ...and only if they are close to each other on the map.
      const gap = Math.hypot(sender.x - target.x, sender.y - target.y);
      if (gap > SIGNAL_MAX_DISTANCE) return;

      io.to(data.to).emit(eventName, { from: socket.id, [key]: data[key] });
    });
  });

  socket.on("disconnect", () => {
    removeUser(socket);
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT) || 5000;

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the old server process, then run npm run dev again.`);
  } else {
    console.error("Server error:", error);
  }
  process.exitCode = 1;
});

connectDB(); // connect to MongoDB in the background (see config/db.js)

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running at http://localhost:${PORT}`);
});
