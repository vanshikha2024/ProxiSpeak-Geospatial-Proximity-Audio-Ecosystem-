// ---------------------------------------------------------------
// components/RemoteAudio.jsx - plays other people's voices, quieter
// the farther away they stand.
//
// Each voice goes through the Web Audio API:
//   voice -> GainNode (volume from distance) -> your speakers
// The <audio> tag is muted. It only keeps the voice stream active,
// so no sound plays twice.
// ---------------------------------------------------------------
import { useEffect, useRef } from "react";

function SpatialVoice({ stream, volume }) {
  const gainRef = useRef(null);
  const contextRef = useRef(null);
  const audioRef = useRef(null);
  const volumeRef = useRef(volume);

  // Keep the latest volume in a ref (updated after each render)
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Build the audio graph once per voice stream
  useEffect(() => {
    const context = new AudioContext();
    context.resume().catch(() => {});

    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = volumeRef.current;
    source.connect(gain).connect(context.destination);

    contextRef.current = context;
    gainRef.current = gain;

    // Keep the stream active in a muted element (a browser requirement)
    if (audioRef.current) audioRef.current.srcObject = stream;

    return () => {
      source.disconnect();
      gain.disconnect();
      context.close();
      contextRef.current = null;
      gainRef.current = null;
    };
  }, [stream]);

  // Smoothly change the volume when someone moves closer or farther
  useEffect(() => {
    const gain = gainRef.current;
    const context = contextRef.current;
    if (gain && context) {
      gain.gain.setTargetAtTime(volume, context.currentTime, 0.05);
    }
  }, [volume]);

  return (
    <>
      <audio ref={audioRef} autoPlay muted />
      {/* Hidden value that the automated test reads */}
      <span hidden data-volume={volume.toFixed(2)} />
    </>
  );
}

export default function RemoteAudio({ streams, volumes }) {
  return (
    <>
      {Object.entries(streams).map(([id, stream]) => (
        <SpatialVoice key={id} stream={stream} volume={volumes[id] ?? 0} />
      ))}
    </>
  );
}
