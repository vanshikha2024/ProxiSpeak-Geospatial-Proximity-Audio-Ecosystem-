# ProxiSpeak — Local Development

ProxiSpeak is an early prototype of a shared virtual office. This version includes:
- React/Vite virtual office UI
- Socket.io live avatar position synchronization
- Connection status and disconnect handling

**Not implemented yet:** WebRTC audio, distance-based volume, MongoDB persistence, authentication, and production deployment. These are planned next milestones; this ZIP does not claim they are complete.

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

## Test real-time movement
1. Open the Vite URL in one browser window.
2. Open the same URL in a second window or an incognito window.
3. Both should show `Connected`; the online count should be 2.
4. Click the page and move with W/A/S/D or the arrow keys.
5. The other browser should show the avatar moving too.
6. Close one browser; the other should show the online count drop.

## Frontend settings (.env)
The frontend finds the server through `VITE_SERVER_URL`.
```powershell
cd client
copy .env.example .env
```
Change the value inside `.env` only if your server is not on `http://localhost:5000`. Restart `npm run dev` after changing it.

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
- `client/`: React UI and Socket.io client
- `server/`: Express health endpoint and Socket.io server
- Live positions are stored in server memory and are lost when the server restarts.
