import { useEffect, useRef } from "react";

const DEFAULT_AUDIO_RADIUS = 100;

function getAudioRadius(audioRadius) {
  return Number.isFinite(audioRadius) && audioRadius > 0
    ? audioRadius
    : DEFAULT_AUDIO_RADIUS;
}

function getDistanceVolume(distance, radius) {
  if (!Number.isFinite(distance) || distance < 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, 1 - distance / radius));
}

function RemoteAudioPlayer({ socketId, stream, distance, audioRadius }) {
  const audioRef = useRef(null);
  const radius = getAudioRadius(audioRadius);
  const volume = getDistanceVolume(distance, radius);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return undefined;
    }

    if (audioElement.srcObject !== stream) {
      audioElement.srcObject = stream;
    }

    return () => {
      if (audioElement.srcObject === stream) {
        audioElement.srcObject = null;
      }
    };
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);
  
  console.log("[RemoteAudio]", {
    socketId,
    distance,
    audioRadius: radius,
    volume,
    });
  return (
    <audio
      ref={audioRef}
      data-remote-socket-id={socketId}
      autoPlay
      playsInline
    />
  );
}

function RemoteAudio({ users, audioRadius }) {
  if (!Array.isArray(users) || users.length === 0) {
    return null;
  }

  return (
    <div className="remote-audio" aria-label="Remote voice audio">
      {users.map((user) => (
        <RemoteAudioPlayer
          key={user.socketId}
          socketId={user.socketId}
          stream={user.stream}
          distance={user.distance}
          audioRadius={audioRadius}
        />
      ))}
    </div>
  );
}

export default RemoteAudio;