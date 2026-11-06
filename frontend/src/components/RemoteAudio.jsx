
import { useEffect, useRef } from "react";

const DEFAULT_AUDIO_RADIUS = 100;

function getAudioRadius(audioRadius) {
  return Number.isFinite(audioRadius) && audioRadius > 0
    ? audioRadius
    : DEFAULT_AUDIO_RADIUS;
}

function getDistanceVolume(distance, radius) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / radius));
}

function lineIntersectsObstacle(start, end, obstacle) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let tMin = 0;
  let tMax = 1;

  const checks = [
    [start.x, dx, obstacle.x, obstacle.x + obstacle.width],
    [start.y, dy, obstacle.y, obstacle.y + obstacle.height],
  ];

  for (const [origin, direction, min, max] of checks) {
    if (Math.abs(direction) < 0.000001) {
      if (origin < min || origin > max) return false;
      continue;
    }

    let t1 = (min - origin) / direction;
    let t2 = (max - origin) / direction;

    if (t1 > t2) [t1, t2] = [t2, t1];

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) return false;
  }

  return true;
}

function getObstacleVolume(user, obstacles) {
  const start = { x: user.localX, y: user.localY };
  const end = { x: user.x, y: user.y };

  let volume = 1;

  for (const obstacle of obstacles) {
    if (obstacle.blocksSound === false) continue;

    if (lineIntersectsObstacle(start, end, obstacle)) {
      volume *= 1 - (obstacle.soundAttenuation ?? 1);
    }
  }

  return volume;
}

function getStereoPan(user, radius) {
  if (
    !Number.isFinite(user?.x) ||
    !Number.isFinite(user?.localX)
  ) {
    return 0;
  }

  const horizontalDifference = user.x - user.localX;

  return Math.max(
    -1,
    Math.min(1, horizontalDifference / radius)
  );
}

function RemoteAudioPlayer({
  socketId,
  stream,
  distance,
  audioRadius,
  user,
  obstacles,
}) {
  const audioRef = useRef(null);
  const audioGraphRef = useRef(null);

  const radius = getAudioRadius(audioRadius);

  const distanceVolume = getDistanceVolume(distance, radius);
  const obstacleVolume = getObstacleVolume(user, obstacles);

  const volume = Math.max(
    0,
    Math.min(1, distanceVolume * obstacleVolume)
  );

  const stereoPan = getStereoPan(user, radius);

  // Create the Web Audio graph only once per audio element.
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("[RemoteAudio] Web Audio API unavailable.");
      return;
    }

    let context;

    try {
      context = new AudioContextClass();

      const source = context.createMediaElementSource(audioElement);
      const gain = context.createGain();
      const panner = context.createStereoPanner();

      source.connect(gain);
      gain.connect(panner);
      panner.connect(context.destination);

      audioGraphRef.current = {
        context,
        source,
        gain,
        panner,
      };
    } catch (error) {
      console.warn("[RemoteAudio] Stereo setup failed:", error);
      context?.close().catch(() => {});
    }

    return () => {
      const graph = audioGraphRef.current;

      if (graph) {
        graph.source.disconnect();
        graph.gain.disconnect();
        graph.panner.disconnect();
        graph.context.close().catch(() => {});
        audioGraphRef.current = null;
      }
    };
  }, []);

  // Attach the existing WebRTC stream.
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    audioElement.srcObject = stream;

    const graph = audioGraphRef.current;

    if (graph?.context.state === "suspended") {
      graph.context.resume().catch(console.error);
    }

    audioElement.play().catch((error) => {
      console.warn("[RemoteAudio] Playback blocked:", error);
    });

    return () => {
      audioElement.srcObject = null;
    };
  }, [stream]);

  // Preserve distance and wall-based volume attenuation.
  useEffect(() => {
    const graph = audioGraphRef.current;

    if (graph) {
      graph.gain.gain.value = volume;
      audioRef.current.volume = 1;
    } else if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Position the voice in the left/right stereo field.
  useEffect(() => {
    const graph = audioGraphRef.current;

    if (graph) {
      graph.panner.pan.value = stereoPan;
    }
  }, [stereoPan]);

  return (
    <audio
      ref={audioRef}
      data-remote-socket-id={socketId}
      autoPlay
      playsInline
    />
  );
}

function RemoteAudio({ users, audioRadius, obstacles = [] }) {
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
          user={user}
          obstacles={obstacles}
        />
      ))}
    </div>
  );
}

export default RemoteAudio;
