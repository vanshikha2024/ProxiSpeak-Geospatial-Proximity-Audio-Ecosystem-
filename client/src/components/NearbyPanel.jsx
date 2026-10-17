// ---------------------------------------------------------------
// components/NearbyPanel.jsx - shows who is inside my audio radius.
// ---------------------------------------------------------------
import { AUDIO_LEAVE_RADIUS, AUDIO_RADIUS } from "../config";

// Friendly text for the WebRTC connection state.
const STATE_LABELS = {
  connecting: "connecting...",
  connected: "🔊 voice connected",
  disconnected: "connection lost",
  failed: "connection failed",
};

export default function NearbyPanel({ nearby, peerStates = {} }) {
  return (
    <div className="nearby-panel">
      <h3>
        In earshot ({nearby.length})
        <span>
          connect within {AUDIO_RADIUS}px, drop after {AUDIO_LEAVE_RADIUS}px
        </span>
      </h3>

      {nearby.length === 0 ? (
        <p className="muted">Walk closer to someone to start a conversation.</p>
      ) : (
        <ul>
          {nearby.map((user) => (
            <li key={user.id}>
              <span>{user.name}</span>
              <span className="muted">
                {STATE_LABELS[peerStates[user.id]] || "waiting"} · {user.distance}px
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
