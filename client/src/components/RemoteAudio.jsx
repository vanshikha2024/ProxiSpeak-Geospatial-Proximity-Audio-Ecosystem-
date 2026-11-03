// ---------------------------------------------------------------
// components/RemoteAudio.jsx - plays other people's voices, quieter
// the farther away they stand.
//
// Each voice goes through the Web Audio API:
//   voice -> GainNode (volume from distance)
//         -> StereoPannerNode (left/right from direction) -> your speakers
// The <audio> tag is muted. It only keeps the voice stream active,
// so no sound plays twice.
// ---------------------------------------------------------------
import { useEffect, useRef } from "react";

function SpatialVoice({ stream, volume, pan }) {
  const gainRef = useRef(null);
  const pannerRef = useRef(null);
  const contextRef = useRef(null);
  const audioRef = useRef(null);
  const volumeRef = useRef(volume);
  const panRef = useRef(pan);

  // Keep the latest values in refs (updated after each render)
  useEffect(() => {
    volumeRef.current = volume;
    panRef.current = pan;
  }, [volume, pan]);

  // Build the audio graph once per voice stream
  useEffect(() => {
    const context = new AudioContext();
    context.resume().catch(() => {});

    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = volumeRef.current;

    const panner = context.createStereoPanner();
    panner.pan.value = panRef.current;

    source.connect(gain).connect(panner).connect(context.destination);

    contextRef.current = context;
    gainRef.current = gain;
    pannerRef.current = panner;

    // Keep the stream active in a muted element (a browser requirement)
    if (audioRef.current) audioRef.current.srcObject = stream;

    return () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      context.close();
      contextRef.current = null;
      gainRef.current = null;
      pannerRef.current = null;
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

  // Smoothly move the voice left or right as people walk around
  useEffect(() => {
    const panner = pannerRef.current;
    const context = contextRef.current;
    if (panner && context) {
      panner.pan.setTargetAtTime(pan, context.currentTime, 0.05);
    }
  }, [pan]);

  return (
    <>
      <audio ref={audioRef} autoPlay muted />
      {/* Hidden values that the automated test reads */}
      <span hidden data-volume={volume.toFixed(2)} data-pan={pan.toFixed(2)} />
    </>
  );
}

export default function RemoteAudio({ streams, voices }) {
  return (
    <>
      {Object.entries(streams).map(([id, stream]) => {
        const voice = voices[id] ?? { volume: 0, pan: 0 };
        return (
          <SpatialVoice key={id} stream={stream} volume={voice.volume} pan={voice.pan} />
        );
      })}
    </>
  );
}
