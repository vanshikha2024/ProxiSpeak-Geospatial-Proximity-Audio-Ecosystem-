// ---------------------------------------------------------------
// components/NearbyPanel.jsx - shows who is inside my audio radius.
// ---------------------------------------------------------------
import { AUDIO_RADIUS } from "../config";

export default function NearbyPanel({ nearby }) {
  return (
    <div className="nearby-panel">
      <h3>
        In earshot ({nearby.length})
        <span> within {AUDIO_RADIUS}px</span>
      </h3>

      {nearby.length === 0 ? (
        <p className="muted">Walk closer to someone to start a conversation.</p>
      ) : (
        <ul>
          {nearby.map((user) => (
            <li key={user.id}>
              <span>{user.name}</span>
              <span className="muted">{user.distance}px</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
