// ---------------------------------------------------------------
// App.jsx - puts the pieces together.
// (All the heavy work lives in hooks/ and components/.)
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import "./App.css";
import JoinScreen from "./components/JoinScreen";
import NearbyPanel from "./components/NearbyPanel";
import OfficeCanvas from "./components/OfficeCanvas";
import RemoteAudio from "./components/RemoteAudio";
import TopBar from "./components/TopBar";
import VoiceControls from "./components/VoiceControls";
import { useMicrophone } from "./hooks/useMicrophone";
import { usePeerConnections } from "./hooks/usePeerConnections";
import { useSocket } from "./hooks/useSocket";
import { volumeForDistance } from "./audio/volume";
import { panForOffset } from "./audio/panning";
import { pickVoicePeers } from "./utils/voicePeers";
import { AUDIO_RADIUS, MAX_VOICE_PEERS } from "./config";

export default function App() {
  const {
    socket,
    connected,
    connectError,
    users,
    usersRef,
    myId,
    spawn,
    profile,
    join,
  } = useSocket();

  // My microphone (the next days send this audio to nearby people).
  const mic = useMicrophone();

  // Who is inside my audio radius: [{ id, name, distance }]
  const [nearby, setNearby] = useState([]);

  // Just the ids of the nearby people (the hook only needs ids).
  // Mesh limit: talk to at most MAX_VOICE_PEERS people at once.
  // The people already connected keep their place (see voicePeers.js).
  const [voiceIds, setVoiceIds] = useState([]);
  const [seenNearby, setSeenNearby] = useState(nearby);
  if (seenNearby !== nearby) {
    // The nearby list changed: pick the voice people again (React pattern
    // for updating state from a prop, instead of using an effect)
    setSeenNearby(nearby);
    setVoiceIds(
      pickVoicePeers(nearby, MAX_VOICE_PEERS, new Set(voiceIds)).map((user) => user.id)
    );
  }
  const nearbyIds = voiceIds;

  // How loud each nearby person is, from their distance (0 to 1)
  const voices = useMemo(
    () =>
      Object.fromEntries(
        nearby.map((user) => [
          user.id,
          {
            volume: volumeForDistance(user.distance, AUDIO_RADIUS),
            pan: panForOffset(user.dx, AUDIO_RADIUS),
          },
        ])
      ),
    [nearby]
  );

  // WebRTC: connect my microphone to the people in my audio radius.
  const { remoteStreams, peerStates } = usePeerConnections({
    socket,
    myId,
    nearbyIds,
    localStream: mic.stream,
  });

  return (
    <main className="page">
      <TopBar connected={connected} connectError={connectError} />

      {/* Step 1: ask for a name and room.  Step 2: show the office. */}
      {!profile ? (
        <JoinScreen connected={connected} onJoin={join} />
      ) : (
        <section className="office">
          <div className="office-title">
            <div>
              <h2>Virtual Office</h2>
              <p>
                Room: <strong>{profile.roomId}</strong> - move around to
                explore.
              </p>
            </div>
            <span className="online-count">
              <strong>{users.length}</strong> online
            </span>
          </div>

          <OfficeCanvas
            socket={socket}
            connected={connected}
            usersRef={usersRef}
            myId={myId}
            spawn={spawn}
            onNearbyChange={setNearby}
          />

          <VoiceControls mic={mic} />
          <NearbyPanel nearby={nearby} peerStates={peerStates} />
          <RemoteAudio streams={remoteStreams} voices={voices} />
        </section>
      )}
    </main>
  );
}
