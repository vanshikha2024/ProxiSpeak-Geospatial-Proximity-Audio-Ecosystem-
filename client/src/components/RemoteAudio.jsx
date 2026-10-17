// ---------------------------------------------------------------
// components/RemoteAudio.jsx - plays other people's voices.
// It draws nothing visible: one hidden <audio> per person.
// ---------------------------------------------------------------
import { useEffect, useRef } from "react";

function AudioPlayer({ stream }) {
  const audioRef = useRef(null);

  // Connect the MediaStream to the <audio> element.
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream;
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
}

export default function RemoteAudio({ streams }) {
  return (
    <>
      {Object.entries(streams).map(([id, stream]) => (
        <AudioPlayer key={id} stream={stream} />
      ))}
    </>
  );
}
