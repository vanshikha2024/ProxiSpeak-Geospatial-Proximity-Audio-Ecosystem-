
import { useEffect, useRef, useState } from "react";

const DEFAULT_AUDIO_RADIUS = 100;

export function useSpatialAudio(
  stream,
  distance,
  audioRadius = DEFAULT_AUDIO_RADIUS
) {
  const contextRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const [gain, setGain] = useState(0);

  useEffect(() => {
    if (!stream) return;

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      console.error("Web Audio API is not supported.");
      return;
    }

    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();

    source.connect(gainNode);
    gainNode.connect(context.destination);

    contextRef.current = context;
    sourceRef.current = source;
    gainNodeRef.current = gainNode;

    if (context.state === "suspended") {
      context.resume().catch(console.error);
    }

    return () => {
      source.disconnect();
      gainNode.disconnect();
      context.close().catch(() => {});
      contextRef.current = null;
      sourceRef.current = null;
      gainNodeRef.current = null;
    };
  }, [stream]);

  useEffect(() => {
    const radius =
      Number.isFinite(audioRadius) && audioRadius > 0
        ? audioRadius
        : DEFAULT_AUDIO_RADIUS;

    const nextGain =
      Number.isFinite(distance) && distance >= 0
        ? Math.max(0, Math.min(1, 1 - distance / radius))
        : 0;

    setGain(nextGain);

    const context = contextRef.current;
    const gainNode = gainNodeRef.current;

    if (context && gainNode) {
      gainNode.gain.setTargetAtTime(
        nextGain,
        context.currentTime,
        0.015
      );
    }
  }, [distance, audioRadius, stream]);

  return gain;
}
