// ---------------------------------------------------------------
// components/VoiceControls.jsx - join/leave voice, mute, level meter.
// ---------------------------------------------------------------
export default function VoiceControls({ mic }) {
  const isOn = mic.status === "on";

  return (
    <div className="voice-controls">
      <div className="voice-buttons">
        {!isOn ? (
          <button
            type="button"
            className="btn primary"
            onClick={mic.start}
            disabled={mic.status === "requesting"}
          >
            {mic.status === "requesting" ? "Waiting for permission..." : "🎤 Join voice"}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={mic.toggleMute}>
              {mic.muted ? "🔇 Unmute" : "🎙️ Mute"}
            </button>
            <button type="button" className="btn danger" onClick={mic.stop}>
              Leave voice
            </button>
          </>
        )}
      </div>

      {/* Level meter: shows that the browser really hears you */}
      {isOn && (
        <div
          className="meter"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(mic.level * 100)}
        >
          <div className="meter-fill" style={{ width: `${mic.level * 100}%` }} />
        </div>
      )}

      {isOn && mic.muted && <span className="muted">You are muted</span>}

      {mic.status === "error" && (
        <p className="error-text" role="alert">{mic.error}</p>
      )}
    </div>
  );
}
