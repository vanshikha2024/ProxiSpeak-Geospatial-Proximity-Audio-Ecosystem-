import { useEffect, useState } from "react";
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
import { useWebRTC } from "./hooks/useWebRTC";
import { socket } from "./network/socket";


function App() {
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomsError, setRoomsError] = useState("");
  const [roomId, setRoomId] = useState("");
  const { position: localPosition} = useLocalAvatar();
  const { isConnected } = useSocket();
  const { userId, users, roomError, joinRoom } = useRoom();
  const joined = Boolean(userId);
  const audioRadius = useAudioRadius(joined ? roomId : "");
  const nearbyUsers = useNearbyUsers(localPosition, users, userId, audioRadius);
  const interpolatedUsers = useInterpolatedAvatars(nearbyUsers);
  const localSocketId = socket.id;
  const { remoteStreams, connectionStatuses, speakingUsers, startAudio, isMuted, toggleMute, leaveVoice } = useWebRTC(localSocketId, nearbyUsers);
  const [voiceStarted, setVoiceStarted] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const remoteAudioUsers = remoteStreams.map((remote) => {
  const user = users.find(
      (item) => item.socketId === remote.socketId
    );

    if (!user) return null;

    const distance = Math.hypot(
      user.x - localPosition.x,
      user.y - localPosition.y
    );

    return {
      ...remote,
      distance,
    };
  }).filter(Boolean);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL;

    async function loadRooms() {
      try {
        const response = await fetch(`${serverUrl}/api/rooms`);

        if (!response.ok) {
          throw new Error(`Could not load rooms (${response.status})`);
        }

        const result = await response.json();
        const availableRooms = Array.isArray(result.data) ? result.data : [];

        setRooms(availableRooms);
        setRoomId((currentId) => currentId || availableRooms[0]?._id || "");
        setRoomsError("");
      } catch (error) {
        setRoomsError(error.message || "Could not load rooms.");
      }
    }

    loadRooms();
  }, []);

  useAvatarSync(localPosition, userId)

  function handleJoin(event) {
    event.preventDefault();

    if (!name.trim() || !roomId.trim()) {
      return;
    }

    joinRoom(name, roomId, localPosition);
  }
  const handleStartVoice = async () => {
    try {
      setVoiceError("");

      await startAudio();

      setVoiceStarted(true);
    } catch (error) {
      console.error("Could not start voice:", error);

      setVoiceError(
        error?.message || "Could not start voice. Check microphone permissions."
      );
    }
  };

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
          <select
            id="roomId"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            required
          >
            <option value="">Select a room</option>
            {rooms.map((room) => (
              <option key={room._id} value={room._id}>
                {room.name}
              </option>
            ))}
          </select>

          {roomsError && <p>{roomsError}</p>}

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
      
      <div className="voice-controls">
        <button
          type="button"
          onClick={handleStartVoice}
          disabled={voiceStarted}
        >
          {voiceStarted ? "Voice Started" : "Start Voice"}
        </button>

        {voiceStarted && (
          <>
            <button type="button" onClick={toggleMute}>
              {isMuted ? "Unmute" : "Mute"}
            </button>

            <button
              type="button"
              onClick={() => {
                leaveVoice();
                setVoiceStarted(false);
                setVoiceError("");
              }}
            >
              Leave Voice
            </button>
          </>
        )}

        {voiceError && (
          <p role="alert" className="voice-error">
            {voiceError}
          </p>
        )}
      </div>



      {joined && (
        <OfficeMap 
        users={interpolatedUsers} 
        currentUserId={userId} 
        localPosition={localPosition}
        />
      )}

      {joined && (<NearbyPanel nearbyUsers={nearbyUsers} audioRadius={audioRadius} connectionStatuses={connectionStatuses} speakingUsers={speakingUsers}/>
      )}

      {joined && (
        <div className="remote-audio">
          {remoteAudioUsers.map(({ socketId, stream, distance }) => {
            const radius =
              Number.isFinite(audioRadius) && audioRadius > 0
                ? audioRadius
                : 100;

            const volume =
              Number.isFinite(distance) && distance >= 0
                ? Math.max(0, Math.min(1, 1 - distance / radius))
                : 0;

            return (
              <audio
                key={socketId}
                autoPlay
                playsInline
                ref={(element) => {
                  if (!element) return;

                  if (element.srcObject !== stream) {
                    element.srcObject = stream;
                  }

                  element.volume = volume;
                }}
              />
            );
          })}
        </div>
      )}


    </main>
  );
}

export default App;
