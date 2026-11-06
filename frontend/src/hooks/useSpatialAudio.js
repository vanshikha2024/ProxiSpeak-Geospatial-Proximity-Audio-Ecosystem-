import { useEffect, useRef } from "react";

let sharedAudioContext = null;

function getAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
  }

  return sharedAudioContext;
}

// Called from the Join Voice button action.
export async function resumeSpatialAudioContexts() {
  const context = getAudioContext();

  if (context.state === "suspended") {
    await context.resume();
  }
}

export function useSpatialAudio(
  stream,
  distance,
  localX,
  remoteX,
  radius = 100,
  obstacleVolume = 1
) {
  const audioRef = useRef(null);
  const contextRef = useRef(null);
  const sourceRef = useRef(null);
  const gainRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const context = getAudioContext();
    console.log("[SpatialAudio] Stream received:", {
        streamActive: stream.active,
        tracks: stream.getAudioTracks().map((track) => ({
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
        })),
        contextState: context.state,
    });
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    const pan = context.createStereoPanner();

    source.connect(gain);
    gain.connect(pan);
    pan.connect(context.destination);

    contextRef.current = context;
    sourceRef.current = source;
    gainRef.current = gain;
    panRef.current = pan;

    if (context.state === "suspended") {
      context.resume().catch(console.error);
    }

    return () => {
      source.disconnect();
      gain.disconnect();
      pan.disconnect();

      contextRef.current = null;
      sourceRef.current = null;
      gainRef.current = null;
      panRef.current = null;
    };
  }, [stream]);

  useEffect(() => {
    const context = contextRef.current;
    const gain = gainRef.current;
    const pan = panRef.current;

    if (!context || !gain || !pan) return;

    const safeRadius = Math.max(radius, 1);
    const safeDistance = Math.max(0, distance || 0);

    const distanceVolume = Math.max(
      0,
      Math.min(1, 1 - safeDistance / safeRadius)
    );

    const volume =
      distanceVolume * Math.max(0, Math.min(1, obstacleVolume));

    const panValue = Math.max(
      -1,
      Math.min(1, (remoteX - localX) / safeRadius)
    );

    gain.gain.setTargetAtTime(volume, context.currentTime, 0.05);
    pan.pan.setTargetAtTime(panValue, context.currentTime, 0.05);
  }, [distance, localX, remoteX, radius, obstacleVolume]);

  return audioRef;
}