# ProxiSpeak - Local Development

ProxiSpeak is a shared virtual office with **proximity voice chat**: the closer
your avatar is to someone, the more you can hear them. This version includes:

- React/Vite virtual office drawn on an HTML5 Canvas (keyboard + click movement)
- Join screen (name + room); each room is separate
- Socket.io live avatar positions, with smooth movement for everybody
- 100 px audio radius (shown on the map) and a "who is in earshot" panel
- Microphone access with mute and a level meter
- **WebRTC peer-to-peer audio** between people who are near each other,
  using the server only for signaling

**Not implemented yet:** distance-based volume and 3D panning (Web Audio API),
MongoDB geospatial storage, Redis scaling, saved office layouts,
authentication, and production deployment.

## Requirements
- Node.js LTS (Node 20.19+ or 22.12+; Node 24 should also work)
- npm

## First-time setup (Windows / PowerShell)

Open VS Code in this folder. Open two terminals.

### Terminal 1 — backend
```powershell
cd server
npm install
npm run dev
```
Expected message:
`ProxiSpeak server running at http://localhost:5000`

Verify in a browser: http://localhost:5000

### Terminal 2 — frontend
```powershell
cd client
npm install
npm run dev
```
Open the exact Local URL printed by Vite (for example, http://localhost:5173). Vite may select 5174 or another port if a port is busy; the backend CORS configuration accepts Vite development origins.

Keep both terminals open while using the app.

## Test it yourself
1. Open the Vite URL in **two** browser windows (one can be incognito).
2. In both, type a name and click **Enter office**. Both show `Connected`, `2 online`.
3. Move with W/A/S/D, the arrow keys, or by clicking the map. The other window
   shows your avatar gliding smoothly.
4. A purple dashed circle shows your 100 px audio radius. Anyone inside gets a
   green ring and appears in the **In earshot** panel.
5. Click **Join voice** in both windows and allow the microphone.
   When the avatars are close, the panel shows `voice connected`.
6. Walk apart (more than 120 px). The voice connection closes. Walk back
   (within 100 px) and it connects again.

Tip: use **headphones**, or two different computers. Two windows on one
computer share one microphone and will echo.

Add `?debug` to the address (for example `http://localhost:5173/?debug`) to see
a live FPS counter.

## Automatic checks
```powershell
cd client
npm run lint
npm test            # proximity unit tests

cd ../server
npm run test:signaling   # signaling rules (same room, near enough, joined)
```

## If it gets stuck on "Connecting..."
This usually means the browser is not reaching the server, or an old process is occupying port 5000.

1. Confirm http://localhost:5000 displays `ProxiSpeak server is running!`.
2. In PowerShell, find the process using port 5000:
   ```powershell
   Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
   ```
3. If an old ProxiSpeak Node process is using it, note the `OwningProcess` number and stop only that process:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
   Replace `<PID>` with the actual number. Do not stop a process unless you have confirmed it is the old ProxiSpeak server.
4. Start the backend again in Terminal 1:
   ```powershell
   cd server
   npm run dev
   ```
5. Refresh the Vite page. Check browser DevTools Console if it still fails.

## Git hygiene
- Do not commit `node_modules`, `.env`, `.env.local`, passwords, API keys, or database credentials.
- Work on your assigned feature branch and open a Pull Request; do not push directly to `main`.

## Current architecture
```
client/src
  config.js                  all settings (sizes, audio radius, server URL)
  network/socket.js          the one socket connection
  network/events.js          every socket event name
  canvas/drawOffice.js       paints the office and avatars
  utils/proximity.js         "who is near me?" (+ proximity.test.js)
  hooks/useSocket.js         connection, users, join
  hooks/useKeyboard.js       held movement keys
  hooks/useMicrophone.js     getUserMedia, mute, level meter
  hooks/usePeerConnections.js  WebRTC offer/answer/ICE for nearby people
  components/                TopBar, JoinScreen, OfficeCanvas, NearbyPanel,
                             VoiceControls, RemoteAudio
server/index.js              Express + Socket.io: rooms, positions, signaling relay
server/scripts/test-signaling.js
```

### Socket events
| Direction | Event | Data |
|---|---|---|
| client -> server | `user:join` | `{ username, roomId }` |
| client -> server | `position:update` | `{ x, y }` |
| server -> client | `users:update` | `[ { id, name, room, x, y } ]` (only your room) |
| both ways | `signal:offer` | send `{ to, offer }`, receive `{ from, offer }` |
| both ways | `signal:answer` | send `{ to, answer }`, receive `{ from, answer }` |
| both ways | `signal:ice` | send `{ to, candidate }`, receive `{ from, candidate }` |

All names live in `client/src/network/events.js`. If the team agrees on
different names, change that file (and the matching strings in `server/index.js`).

### How the voice connection works
1. You walk within 100 px of someone. The browser decides who is nearby.
2. The person with the smaller socket id sends a WebRTC **offer**.
3. The other replies with an **answer**; both trade **ICE candidates**.
4. The server only forwards these small messages (and only for people in the
   same room and within 150 px). The audio goes **directly** between browsers.
5. Past 120 px the connection is closed.

Live positions are stored in server memory and are lost when the server restarts.

## Mid-review demo script (about 3 minutes)
1. Start the server and the client. Open two windows, join the same room.
2. Show smooth movement in both windows (`?debug` shows about 60 FPS).
3. Show the audio radius and the green ring / "In earshot" panel.
4. Click **Join voice** in both; show `voice connected` when close.
5. Mute one side; show the level meter and the "You are muted" label.
6. Walk apart; show the connection closing. Walk back; it reconnects.
7. Run `npm run test:signaling` and `npm test` to show the checks passing.

## Two-browser audio check (automated)

This test opens two browsers, lets both join the same office, turns on their
microphones, and checks that a voice connection and live audio work in both
directions. It starts the backend and frontend automatically.

First time only, install the test browser:
```powershell
cd client
npx playwright install chromium
```

Then run the check:
```powershell
npm run test:audio
```

Expected result: `1 passed`. If you already have Chrome installed and
Playwright cannot download its browser, set `PW_CHROME` to your Chrome path
before running the check.
