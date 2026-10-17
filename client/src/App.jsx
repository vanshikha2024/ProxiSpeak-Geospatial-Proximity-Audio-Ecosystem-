// ---------------------------------------------------------------
// ProxiSpeak - Week 1 frontend (virtual office with avatar movement)
//
// What this file does:
//   1. Draws a 2D office on an HTML5 <canvas>.
//   2. Lets you move your avatar with W/A/S/D, arrow keys, or a click.
//   3. Sends your position to the server (max 20 times per second).
//   4. Shows every other user's avatar, moving in real time.
// ---------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

// ---------- Settings (change these in one place) ----------
const WIDTH = 720; // canvas width in pixels
const HEIGHT = 420; // canvas height in pixels
const RADIUS = 16; // avatar size
const EDGE = 18; // keep avatars this far from the wall (same as the server)
const SPEED = 180; // walking speed in pixels per second
const SEND_EVERY_MS = 50; // 50 ms = max 20 position updates per second

// One socket for the whole app. autoConnect:false means we connect
// manually inside useEffect below.
const socket = io("http://localhost:5000", {
  autoConnect: false,
});

// Keep a number inside a minimum and maximum.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------
// drawOffice: paints ONE frame on the canvas.
// It is called ~60 times per second.
// ---------------------------------------------------------------
function drawOffice(ctx, users, myId) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Office floor
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Grid lines
  ctx.strokeStyle = "#edf1f7";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  // Team area
  ctx.fillStyle = "#eef2fa";
  ctx.strokeStyle = "#d6deef";
  ctx.beginPath();
  ctx.roundRect(390, 38, 240, 100, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 12px Arial";
  ctx.fillText("TEAM AREA", 408, 60);

  // Three desks inside the team area
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#dbe5f5";
    ctx.fillRect(408 + i * 70, 74, 62, 22);
  }

  // Meeting area
  ctx.fillStyle = "#f5f0ff";
  ctx.strokeStyle = "#e7dafa";
  ctx.beginPath();
  ctx.roundRect(390, 175, 240, 90, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.fillText("MEETING SPACE", 408, 198);

  // Meeting table
  ctx.fillStyle = "#e6def8";
  ctx.beginPath();
  ctx.roundRect(430, 215, 160, 24, 12);
  ctx.fill();

  // Avatars: a light outer circle + a darker inner circle + a label
  users.forEach((user, index) => {
    const isMe = user.id === myId;

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS + 4, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#c7d2fe" : "#cbd5e1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#635bdb" : "#64748b";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isMe ? "YOU" : `P${index + 1}`, user.x, user.y);
  });

  // Reset text settings so the next frame starts clean
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export default function App() {
  // ---------- Refs ----------
  // A "ref" stores a value WITHOUT re-rendering React.
  // We use refs for things that change many times per second.
  const canvasRef = useRef(null);
  const positionRef = useRef({ x: 100, y: 100 }); // where I am RIGHT NOW (local)
  const targetRef = useRef({ x: 100, y: 100 }); // where I am walking to
  const usersRef = useRef([]); // latest list of users from the server
  const keysRef = useRef(new Set()); // keys currently held down
  const lastSentTimeRef = useRef(0); // when I last sent my position
  const lastSentPosRef = useRef({ x: 100, y: 100 }); // what I last sent
  const myIdRef = useRef(""); // my socket id
  const spawnedRef = useRef(false); // have I received my start position yet?
  // DAY 2: the smoothed ("display") position of OTHER users.
  // Map of user id -> { x, y }. The server sends them only 20 times per
  // second, so we glide the drawn avatar toward the latest position.
  const displayRef = useRef(new Map());

  // ---------- State (things shown in the page text) ----------
  const [users, setUsers] = useState([]);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [connected, setConnected] = useState(false);

  // ---------------------------------------------------------------
  // The server sends "users:update" with the full list of users
  // every time someone joins, moves, or leaves.
  // ---------------------------------------------------------------
  const updateUsers = useCallback((nextUsers) => {
    usersRef.current = nextUsers;
    setUsers(nextUsers);

    // DAY 1 FIX:
    // Take my position from the server ONLY ONCE (when I first spawn).
    // After that, my local position is the truth. The server's copy of
    // my position is always a little old, so using it again and again
    // would pull my avatar backwards ("rubber-banding").
    const me = nextUsers.find((user) => user.id === socket.id);
    if (me && !spawnedRef.current) {
      spawnedRef.current = true;
      myIdRef.current = socket.id;
      positionRef.current = { x: me.x, y: me.y };
      targetRef.current = { x: me.x, y: me.y };
      lastSentPosRef.current = { x: me.x, y: me.y };
      setPosition({ x: me.x, y: me.y });
    }
  }, []);

  // ---------------------------------------------------------------
  // Connect to the server when the page opens, disconnect when it closes.
  // ---------------------------------------------------------------
  useEffect(() => {
    const onConnect = () => {
      myIdRef.current = socket.id;
      setConnected(true);
    };

    const onDisconnect = () => {
      // After a reconnect we get a NEW socket id and a new spawn point,
      // so we must allow the spawn step to run again.
      spawnedRef.current = false;
      setConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("users:update", updateUsers);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("users:update", updateUsers);
      socket.disconnect();
    };
  }, [updateUsers]);

  // ---------------------------------------------------------------
  // Main game loop: runs about 60 times per second.
  // Each frame: move me -> draw everyone -> send my position.
  // ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frameId;
    let previousTime = 0;
    let lastUiUpdate = 0;

    function animate(time) {
      // dt = seconds since the last frame (capped so a lag spike
      // does not make the avatar jump).
      const dt = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 0;
      previousTime = time;

      const current = positionRef.current;
      const keys = keysRef.current;

      // 1) MOVE ME ------------------------------------------------
      // Work out the direction from the keys that are held down.
      let dx = 0;
      let dy = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        // Divide by length so moving diagonally is not faster.
        const length = Math.hypot(dx, dy);
        targetRef.current = {
          x: current.x + (dx / length) * SPEED * dt,
          y: current.y + (dy / length) * SPEED * dt,
        };
      }

      // Keep the target inside the office walls.
      const target = targetRef.current;
      const next = {
        x: clamp(target.x, EDGE, WIDTH - EDGE),
        y: clamp(target.y, EDGE, HEIGHT - EDGE),
      };

      // Glide smoothly toward the target instead of teleporting.
      const factor = 1 - Math.exp(-14 * dt);
      current.x += (next.x - current.x) * factor;
      current.y += (next.y - current.y) * factor;

      // 2) DRAW EVERYONE -----------------------------------------
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // DAY 1: draw MYSELF from my local position (instant and smooth).
        // DAY 2: draw OTHERS gliding toward their latest server position,
        // so 20 updates per second look like smooth 60 FPS movement.
        const display = displayRef.current;
        const glide = 1 - Math.exp(-12 * dt); // how fast others catch up
        const stillHere = new Set(); // ids of users in the current list

        const drawList = usersRef.current.map((user) => {
          if (user.id === myIdRef.current) {
            return { ...user, x: current.x, y: current.y };
          }

          stillHere.add(user.id);

          // First time we see this user: show them exactly where they are
          // (do not fly in from the corner).
          let shown = display.get(user.id);
          if (!shown) {
            shown = { x: user.x, y: user.y };
            display.set(user.id, shown);
          }

          // Move the drawn position a bit closer to the real position.
          shown.x += (user.x - shown.x) * glide;
          shown.y += (user.y - shown.y) * glide;
          return { ...user, x: shown.x, y: shown.y };
        });

        // Forget users who left, so the map does not grow forever.
        for (const id of display.keys()) {
          if (!stillHere.has(id)) display.delete(id);
        }
        drawOffice(ctx, drawList, myIdRef.current);
      }

      // 3) SEND MY POSITION --------------------------------------
      // At most 20 times per second, and only if I really moved
      // since the last position I sent.
      if (connected && time - lastSentTimeRef.current >= SEND_EVERY_MS) {
        const last = lastSentPosRef.current;
        const moved =
          Math.abs(last.x - current.x) > 0.5 ||
          Math.abs(last.y - current.y) > 0.5;

        if (moved) {
          socket.emit("position:update", { x: current.x, y: current.y });
          lastSentPosRef.current = { x: current.x, y: current.y };
          lastSentTimeRef.current = time;
        }
      }

      // 4) UPDATE THE "Position: x, y" TEXT ----------------------
      // Only 10 times per second, so React does not re-render 60x/sec.
      if (time - lastUiUpdate >= 100) {
        setPosition({ x: Math.round(current.x), y: Math.round(current.y) });
        lastUiUpdate = time;
      }

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId); // stop the loop on cleanup
  }, [connected]);

  // ---------------------------------------------------------------
  // Keyboard: remember which movement keys are held down.
  // ---------------------------------------------------------------
  useEffect(() => {
    const moveKeys = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (!moveKeys.includes(key)) return;
      event.preventDefault(); // stop arrow keys from scrolling the page
      keysRef.current.add(key);
    }

    function onKeyUp(event) {
      keysRef.current.delete(event.key.toLowerCase());
    }

    // If the window loses focus, forget all keys (avoids a "stuck" key).
    function clearKeys() {
      keysRef.current.clear();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, []);

  // ---------------------------------------------------------------
  // Mouse: click anywhere on the office to walk there.
  // ---------------------------------------------------------------
  function handleCanvasClick(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The canvas may be shown bigger or smaller than 720x420 on screen,
    // so convert the click position into canvas coordinates.
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    targetRef.current = {
      x: clamp((event.clientX - rect.left) * scaleX, EDGE, WIDTH - EDGE),
      y: clamp((event.clientY - rect.top) * scaleY, EDGE, HEIGHT - EDGE),
    };
  }

  // ---------- What appears on the page ----------
  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">SPATIAL COLLABORATION</p>
          <h1>ProxiSpeak</h1>
          <p>Your virtual office, where conversations happen naturally.</p>
        </div>

        <span className={`status ${connected ? "online" : ""}`}>
          {connected ? "● Connected" : "○ Connecting..."}
        </span>
      </header>

      <section className="office">
        <div className="office-title">
          <div>
            <h2>Virtual Office</h2>
            <p>Move around to explore the shared space.</p>
          </div>
          <span className="online-count">
            <strong>{users.length}</strong> online
          </span>
        </div>

        <canvas
          ref={canvasRef}
          className="office-canvas"
          width={WIDTH}
          height={HEIGHT}
          onClick={handleCanvasClick}
          aria-label="Virtual office. Use keyboard controls or click a destination to move."
        />

        <div className="controls">
          <span>W A S D</span>
          <span>or arrow keys to move</span>
          <span>Click office to move</span>
          <span className="coordinates">
            Position: {position.x}, {position.y}
          </span>
        </div>
      </section>
    </main>
  );
}
