// ---------------------------------------------------------------
// components/TopBar.jsx - the title and the connection status.
// ---------------------------------------------------------------
import { SERVER_URL } from "../config";

export default function TopBar({ connected, connectError }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">SPATIAL COLLABORATION</p>
        <h1>ProxiSpeak</h1>
        <p>Your virtual office, where conversations happen naturally.</p>
      </div>

      <div className="status-box">
        <span className={`status ${connected ? "online" : ""}`}>
          {connected ? "● Connected" : "○ Connecting..."}
        </span>

        {/* Show a helpful message when the server cannot be reached */}
        {!connected && connectError && (
          <p className="error-text" role="alert">
            Cannot reach the server at {SERVER_URL}. Is the backend running?
          </p>
        )}
      </div>
    </header>
  );
}
