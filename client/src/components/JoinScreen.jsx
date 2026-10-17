// ---------------------------------------------------------------
// components/JoinScreen.jsx - the first screen: name + room.
// ---------------------------------------------------------------
import { useState } from "react";

const NAME_KEY = "proxispeak:name";

// Read the saved name. Wrapped in try/catch because storage can be blocked.
function loadSavedName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export default function JoinScreen({ connected, onJoin }) {
  const [username, setUsername] = useState(loadSavedName);
  const [roomId, setRoomId] = useState("main-office");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();

    const cleanName = username.trim();
    const cleanRoom = roomId.trim();

    if (!cleanName) return setError("Please type your name.");
    if (!/^[\w-]+$/.test(cleanRoom)) {
      return setError("Room id can only use letters, numbers, - and _.");
    }

    try {
      localStorage.setItem(NAME_KEY, cleanName);
    } catch {
      // Not important if saving fails.
    }

    setError("");
    onJoin(cleanName, cleanRoom);
  }

  return (
    <section className="join-card">
      <h2>Join the office</h2>
      <p>Pick a name and a room. People in the same room can find you.</p>

      <form onSubmit={handleSubmit} className="join-form">
        <label>
          Your name
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={20}
            placeholder="e.g. Vanshikha"
            autoFocus
          />
        </label>

        <label>
          Room id
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            maxLength={30}
          />
        </label>

        {error && <p className="error-text" role="alert">{error}</p>}

        <button type="submit" disabled={!connected}>
          {connected ? "Enter office" : "Connecting to server..."}
        </button>
      </form>
    </section>
  );
}
