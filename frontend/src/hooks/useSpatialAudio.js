import { useEffect, useMemo, useRef } from "react";

const DEFAULT_AUDIO_RADIUS = 100;

export function useSpatialAudio(stream, distance, audioRadius = DEFAULT_AUDIO_RADIUS) {
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);

  const radius = Number.isFinite(audioRadius) && audioRadius > 0 ? audioRadius : DEFAULT_AUDIO_RADIUS;

  const gain = useMemo(() => {
    if (!Number.isFinite(distance) || distance < 0) return 0;
    return Math.max(0, Math.min(1, 1 - distance / radius));
  }, [distance, radius]);

  useEffect(() => {
    if (!stream) return undefined;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        console.warn("Web Audio API is not supported in this browser.");
        return undefined;
    }

    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();

    source.connect(gainNode);
    gainNode.connect(context.destination);
    gainNode.gain.value = gain;

    audioContextRef.current = context;
    gainNodeRef.current = gainNode;

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    return () => {
      source.disconnect();
      gainNode.disconnect();

      if (gainNodeRef.current === gainNode){
        gainNodeRef.current = null;
      }

      if (audioContextRef.current === context){
        audioContextRef.current = null;
      }
      context.close().catch(() => {});
    };
  }, [stream]);

  useEffect(() => {
    const context = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!context || !gainNode) return;

    gainNode.gain.setTargetAtTime(gain, context.currentTime, 0.015);
  }, [gain]);

  return gain;
}
