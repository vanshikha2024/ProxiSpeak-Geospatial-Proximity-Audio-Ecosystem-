// ---------------------------------------------------------------
// components/OfficeCanvas.jsx - the canvas + the game loop.
//
// Every frame (about 60 times per second):
//   1) move ME   2) draw everyone   3) send my position
// ---------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { drawOffice } from "../canvas/drawOffice";
import { useKeyboard } from "../hooks/useKeyboard";
import { EVENTS } from "../network/events";
import { getNearbyUsers } from "../utils/proximity";
import {
  AUDIO_LEAVE_RADIUS,
  AUDIO_RADIUS,
  DEBUG,
  EDGE,
  HEIGHT,
  SEND_EVERY_MS,
  SPEED,
  WIDTH,
} from "../config";

// Keep a number between a minimum and a maximum.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function OfficeCanvas({
  socket,
  connected,
  usersRef,
  myId,
  spawn,
  onNearbyChange,
}) {
  // Refs store values WITHOUT re-rendering React (good for fast changes).
  const canvasRef = useRef(null);
  const positionRef = useRef({ x: 100, y: 100 }); // where I am RIGHT NOW
  const targetRef = useRef({ x: 100, y: 100 }); // where I am walking to
  const lastSentTimeRef = useRef(0); // when I last sent my position
  const lastSentPosRef = useRef({ x: 100, y: 100 }); // what I last sent
  const displayRef = useRef(new Map()); // smoothed positions of OTHER users
  const nearbyIdsRef = useRef(new Set()); // who was nearby in the last frame
  const keysRef = useKeyboard();

  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [fps, setFps] = useState(0); // only used when DEBUG is on

  // When the server tells me my start position, jump there once.
  useEffect(() => {
    if (!spawn) return;
    positionRef.current = { x: spawn.x, y: spawn.y };
    targetRef.current = { x: spawn.x, y: spawn.y };
    lastSentPosRef.current = { x: spawn.x, y: spawn.y };
  }, [spawn]);

  // ---------- The game loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Sharp drawing on high-resolution screens (phones, retina laptops):
    // make the canvas bitmap bigger, then scale our drawing to match.
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * pixelRatio;
    canvas.height = HEIGHT * pixelRatio;

    let frameId;
    let frameCount = 0; // for the FPS counter
    let lastFpsTime = 0;
    let previousTime = 0;
    let lastUiUpdate = 0;
    let lastNearbyCheck = 0;
    let lastNearbyKey = "";

    function animate(time) {
      // dt = seconds since the last frame (capped so lag does not teleport me)
      const dt = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 0;
      previousTime = time;

      const current = positionRef.current;
      const keys = keysRef.current;

      // 1) MOVE ME ------------------------------------------------
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

      // Keep the target inside the walls, then glide toward it.
      const target = targetRef.current;
      const next = {
        x: clamp(target.x, EDGE, WIDTH - EDGE),
        y: clamp(target.y, EDGE, HEIGHT - EDGE),
      };
      const factor = 1 - Math.exp(-14 * dt);
      current.x += (next.x - current.x) * factor;
      current.y += (next.y - current.y) * factor;

      // 2) DRAW EVERYONE -----------------------------------------
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        // Me: drawn from my LOCAL position (instant and smooth).
        // Others: glide toward their latest server position.
        const display = displayRef.current;
        const glide = 1 - Math.exp(-12 * dt);
        const stillHere = new Set();

        const drawList = usersRef.current.map((user) => {
          if (user.id === myId) {
            return { ...user, x: current.x, y: current.y };
          }

          stillHere.add(user.id);

          let shown = display.get(user.id);
          if (!shown) {
            shown = { x: user.x, y: user.y }; // appear in place
            display.set(user.id, shown);
          }
          shown.x += (user.x - shown.x) * glide;
          shown.y += (user.y - shown.y) * glide;
          return { ...user, x: shown.x, y: shown.y };
        });

        // Forget users who left.
        for (const id of display.keys()) {
          if (!stillHere.has(id)) display.delete(id);
        }

        // Who is inside my audio radius? (uses the positions we DRAW)
        const others = drawList.filter((user) => user.id !== myId);
        const nearbyList = getNearbyUsers(
          current,
          others,
          AUDIO_RADIUS,
          nearbyIdsRef.current, // people already nearby get extra room...
          AUDIO_LEAVE_RADIUS // ...up to this distance
        );
        nearbyIdsRef.current = new Set(nearbyList.map((user) => user.id));

        drawOffice(ctx, drawList, myId, {
          audioRadius: AUDIO_RADIUS,
          nearbyIds: nearbyIdsRef.current,
        });

        // Tell the parent (App) who is nearby - at most 4 times per second,
        // and only when the list really changed.
        if (time - lastNearbyCheck >= 250) {
          lastNearbyCheck = time;
          const rounded = nearbyList.map((user) => ({
            ...user,
            distance: Math.round(user.distance / 5) * 5, // steady numbers
          }));
          const key = JSON.stringify(rounded);
          if (key !== lastNearbyKey) {
            lastNearbyKey = key;
            onNearbyChange(rounded);
          }
        }
      }

      // 3) SEND MY POSITION --------------------------------------
      // At most 20 times per second, and only if I really moved.
      if (connected && time - lastSentTimeRef.current >= SEND_EVERY_MS) {
        const last = lastSentPosRef.current;
        const moved =
          Math.abs(last.x - current.x) > 0.5 ||
          Math.abs(last.y - current.y) > 0.5;

        if (moved) {
          socket.emit(EVENTS.POSITION_UPDATE, { x: current.x, y: current.y });
          lastSentPosRef.current = { x: current.x, y: current.y };
          lastSentTimeRef.current = time;
        }
      }

      // 4) UPDATE THE "Position" TEXT (only 10 times per second) --
      if (time - lastUiUpdate >= 100) {
        setPosition({ x: Math.round(current.x), y: Math.round(current.y) });
        lastUiUpdate = time;
      }

      // 5) COUNT FRAMES PER SECOND (debug only) -------------------
      if (DEBUG) {
        frameCount += 1;
        if (time - lastFpsTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastFpsTime = time;
        }
      }

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [connected, socket, usersRef, myId, keysRef, onNearbyChange]);

  // ---------- Mouse: click anywhere to walk there ----------
  function handleCanvasClick(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The canvas may be shown bigger/smaller than 720x420 on screen,
    // so convert the click position into canvas coordinates.
    const rect = canvas.getBoundingClientRect();
    targetRef.current = {
      x: clamp((event.clientX - rect.left) * (WIDTH / rect.width), EDGE, WIDTH - EDGE),
      y: clamp((event.clientY - rect.top) * (HEIGHT / rect.height), EDGE, HEIGHT - EDGE),
    };
  }

  return (
    <>
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
        {DEBUG && <span className="coordinates">FPS: {fps}</span>}
        <span className={DEBUG ? "" : "coordinates"}>
          Position: {position.x}, {position.y}
        </span>
      </div>
    </>
  );
}
