
import { useEffect, useRef } from "react";

const DEFAULT_AUDIO_RADIUS = 100;

// Reuse one AudioContext and one source graph per audio element.
// This prevents duplicate MediaElementAudioSourceNode creation.
let sharedAudioContext = null;
const audioGraphs = new WeakMap();

function getAudioContext() {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return null;

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

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
  useEffect(() => {
    console.log("[Spatial Audio]", {
      socketId,
      distance: Math.round(distance),
      radius,
      volume: Number(volume.toFixed(3)),
    });
  }, [socketId, distance, radius, volume]);

  // Create or reuse the audio graph.
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    let graph = audioGraphs.get(audioElement);

    try {
      if (!graph) {
        const context = getAudioContext();

        if (!context) {
          console.warn("[RemoteAudio] Web Audio API unavailable.");
          return;
        }

        const source = context.createMediaElementSource(audioElement);
        const gain = context.createGain();
        const panner = context.createStereoPanner();

        graph = { context, source, gain, panner };

        audioGraphs.set(audioElement, graph);
      }

      // Reconnect the existing nodes after React effect cleanup/setup.
      graph.source.connect(graph.gain);
      graph.gain.connect(graph.panner);
      graph.panner.connect(graph.context.destination);

      audioGraphRef.current = graph;
    } catch (error) {
      console.warn("[RemoteAudio] Stereo setup failed:", error);
    }

    return () => {
      const currentGraph = audioGraphRef.current;

      if (currentGraph) {
        currentGraph.source.disconnect();
        currentGraph.gain.disconnect();
        currentGraph.panner.disconnect();

        // Do not close the shared AudioContext here.
        // React Strict Mode may immediately run this effect again.
        audioGraphRef.current = null;
      }
    };
  }, []);

  // Attach and play the existing WebRTC stream.
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    audioElement.srcObject = stream;

    const graph = audioGraphRef.current;

    if (graph?.context.state === "suspended") {
      graph.context.resume().catch((error) => {
        console.warn("[RemoteAudio] Audio context resume failed:", error);
      });
    }

    audioElement.play().catch((error) => {
      // A stream change can interrupt an earlier play() request.
      if (error.name !== "AbortError") {
        console.warn("[RemoteAudio] Playback failed:", error);
      }
    });

    return () => {
      audioElement.pause();
      audioElement.srcObject = null;
    };
  }, [stream]);

  // Apply distance and obstacle volume attenuation.
  useEffect(() => {
    const graph = audioGraphRef.current;

    // Explicitly mute audio outside the radius.
    if (audioRef.current) {
      audioRef.current.muted = volume <= 0;
    }

    if (graph) {
      graph.gain.gain.value = volume;
      if (audioRef.current) {
        audioRef.current.volume = 1;
      }
    } else if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Apply left/right stereo positioning.
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
