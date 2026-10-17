// ---------------------------------------------------------------
// hooks/useMicrophone.js - asks for the microphone and manages it.
//
// Returns:
//   status  - "off" | "requesting" | "on" | "error"
//   error   - a friendly message when status is "error"
//   muted   - true when my mic is muted
//   level   - how loud I am right now, from 0 to 1 (for the meter)
//   stream  - the MediaStream (the next days send this to other people)
//   start   - ask for permission and turn the mic on
//   stop    - turn the mic off
//   toggleMute - mute / unmute without turning the mic off
// ---------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";

// Turn the browser's technical error into a sentence a person understands.
function friendlyError(error) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Your browser blocks the microphone here. Use http://localhost or https.";
  }
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission was denied. Allow it in the browser address bar, then try again.";
    case "NotFoundError":
      return "No microphone was found. Plug one in and try again.";
    case "NotReadableError":
      return "The microphone is busy (maybe another app is using it).";
    default:
      return "Could not start the microphone.";
  }
}

export function useMicrophone() {
  const [status, setStatus] = useState("off");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState(null);

  const streamRef = useRef(null); // same stream, for cleanup

  // Stop every track so the browser's "recording" icon disappears.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return; // already on
    setStatus("requesting");
    setError("");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, // stops the speaker sound from feeding back
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setMuted(false);
      setStatus("on");
    } catch (err) {
      setError(friendlyError(err));
      setStatus("error");
    }
  }, []);

  const stop = useCallback(() => {
    releaseStream();
    setStream(null);
    setLevel(0);
    setMuted(false);
    setStatus("off");
  }, [releaseStream]);

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;

    // A disabled track sends silence but stays connected.
    const willBeMuted = track.enabled; // enabled now -> we are muting it
    track.enabled = !willBeMuted;
    setMuted(willBeMuted);
  }, []);

  // ---------- Level meter ----------
  // Measure the loudness 10 times per second while the mic is on.
  useEffect(() => {
    if (!stream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);

      // Root-mean-square = the average "energy" of the sound wave.
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128; // -1 .. 1
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);

      // Round to steps of 0.05 so React does not re-render for tiny changes.
      setLevel(Math.min(1, Math.round(rms * 4 * 20) / 20));
    }, 100);

    return () => {
      clearInterval(timer);
      source.disconnect();
      audioContext.close();
    };
  }, [stream]);

  // Turn the mic off when the page closes.
  useEffect(() => releaseStream, [releaseStream]);

  return { status, error, muted, level, stream, start, stop, toggleMute };
}
