import { useState } from "react";
import "./App.css";
import { useSocket } from "./hooks/useSocket";
import { useRoom } from "./hooks/useRoom";
import OfficeMap from "./components/OfficeMap"
import { useLocalAvatar } from "./hooks/useLocalAvatar";
import { useAvatarSync } from "./hooks/useAvatarSync";
import { useNearbyUsers } from "./hooks/useNearbyUsers";
import NearbyPanel from "./components/NearbyPanel";
import { useInterpolatedAvatars } from "./hooks/useInterpolatedAvatars";
import { useAudioRadius } from "./hooks/useAudioRadius";


function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("main-office");
  const { position: localPosition} = useLocalAvatar();
  const { isConnected } = useSocket();
  const { userId, users, roomError, joinRoom } = useRoom();
  const joined = Boolean(userId);
  const audioRadius = useAudioRadius(joined ? roomId : "");
  const nearbyUsers = useNearbyUsers(localPosition, users, userId, audioRadius);
  const interpolatedUsers = useInterpolatedAvatars(nearbyUsers);

  useAvatarSync(localPosition, userId)

  function handleJoin(event) {
    event.preventDefault();

    if (!name.trim() || !roomId.trim()) {
      return;
    }

    joinRoom(name, roomId, localPosition);
  }

  return (
    <main className="app">
      <section className="welcome-card">
        <div className="logo">P</div>

        <h1>ProxiSpeak</h1>

        <p className="subtitle">
          Your virtual office. Conversations happen naturally.
        </p>

        <div className="connection-status">
          <span
            className={`status-dot ${isConnected ? "online" : "offline"}`}
          />
          {isConnected ? "Server connected" : "Connecting to server..."}
        </div>

        <form onSubmit={handleJoin}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label htmlFor="roomId">Office room</label>
          <input
            id="roomId"
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            required
          />

          <button type="submit" disabled={!isConnected}>
            Enter Office
          </button>
        </form>

        {roomError && <p className="error-message">{roomError}</p>}

        {userId && (
          <div className="success-message">
            <p>Room joined successfully! Your ID: {userId}
          </p>
          <h3>Other people in this office ({users.length})</h3>

          {users.length === 0? (
            <p>No other users yet, Open another tab to test!
            </p>):(
              <ul className="user-list">
                {users.map((user)=>(
                  <li key={user.id} className="user-item">
                    <span className="user-dot"></span>
                    <span> {user.name || "Guest"}</span>
                  </li>
                ))
                }
              </ul>
          )}
          </div>
        )}

        <p className="footer-text">
          Connect with your team, wherever they are.
        </p>
      </section>

      {joined && (
        <OfficeMap 
        users={interpolatedUsers} 
        currentUserId={userId} 
        localPosition={localPosition}
        />
      )}

      {joined && (<NearbyPanel nearbyUsers={nearbyUsers} audioRadius={audioRadius}/>
      )}
    </main>
  );
}

export default App;
