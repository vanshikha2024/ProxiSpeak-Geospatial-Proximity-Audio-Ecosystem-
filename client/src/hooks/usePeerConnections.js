// ---------------------------------------------------------------
// hooks/usePeerConnections.js - WebRTC audio between nearby people.
//
// The idea in 5 steps (for ONE other person, "B"):
//   1. B walks into my audio radius.
//   2. One of us (the one with the smaller socket id) makes an OFFER.
//      This avoids both of us offering at the same time.
//   3. The other one replies with an ANSWER.
//   4. Both sides trade ICE candidates (possible network routes).
//   5. Audio flows directly between the browsers (peer-to-peer).
//
// Inputs:
//   socket      - the socket (used ONLY for the small signal messages)
//   myId        - my socket id
//   nearbyIds   - ids of people inside my audio radius
//   localStream - my microphone stream (or null if my mic is off)
//
// Returns:
//   remoteStreams - { [userId]: MediaStream }  (play these)
//   peerStates    - { [userId]: "connecting" | "connected" | ... }
// ---------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import { ICE_SERVERS } from "../config";
import { EVENTS } from "../network/events";

// A peer created because of an incoming offer is kept at least this long
// even if my own "who is nearby" list has not caught up yet.
const GRACE_MS = 3000;

export function usePeerConnections({ socket, myId, nearbyIds, localStream }) {
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerStates, setPeerStates] = useState({});

  // id -> { pc, pendingCandidates, createdAt }
  const peersRef = useRef(new Map());
  const myIdRef = useRef(myId);
  const nearbyRef = useRef(nearbyIds);
  const localStreamRef = useRef(localStream);

  // Keep the refs fresh, so the functions below always see current values.
  useEffect(() => {
    myIdRef.current = myId;
    nearbyRef.current = nearbyIds;
    localStreamRef.current = localStream;
  }, [myId, nearbyIds, localStream]);

  // ---------- Small helpers ----------

  // Find the audio "slot" of a connection.
  const getAudioTransceiver = (pc) =>
    pc.getTransceivers().find((t) => t.receiver.track.kind === "audio");

  // Create a new RTCPeerConnection for user `id`.
  const createPeer = useCallback(
    (id, isInitiator) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peer = { pc, pendingCandidates: [], createdAt: Date.now() };
      peersRef.current.set(id, peer);

      // The one who makes the offer creates the audio slot. It is
      // "sendrecv" from the start, so we can plug the microphone in
      // later (replaceTrack) without negotiating again.
      if (isInitiator) {
        const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) transceiver.sender.replaceTrack(track);
      }

      // Send each network route we discover to the other person.
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(EVENTS.SIGNAL_ICE, { to: id, candidate: event.candidate });
        }
      };

      // The other person's audio arrived: save it so we can play it.
      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((prev) => ({ ...prev, [id]: stream }));
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => ({ ...prev, [id]: pc.connectionState }));
      };

      setPeerStates((prev) => ({ ...prev, [id]: "connecting" }));
      return peer;
    },
    [socket]
  );

  // Close one connection and forget its audio.
  const closePeer = useCallback((id) => {
    const peer = peersRef.current.get(id);
    if (!peer) return;

    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peersRef.current.delete(id);

    const without = (prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    };
    setRemoteStreams(without);
    setPeerStates(without);
  }, []);

  // Add the ICE candidates that arrived too early.
  async function flushCandidates(peer) {
    for (const candidate of peer.pendingCandidates) {
      await peer.pc.addIceCandidate(candidate).catch(() => {});
    }
    peer.pendingCandidates = [];
  }

  // I walk up to someone: make an offer.
  const startCall = useCallback(
    async (id) => {
      const peer = createPeer(id, true);
      try {
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        socket.emit(EVENTS.SIGNAL_OFFER, {
          to: id,
          offer: peer.pc.localDescription,
        });
      } catch (error) {
        console.error("Could not create offer:", error);
        closePeer(id);
      }
    },
    [createPeer, closePeer, socket]
  );

  // Open connections to people who came near; close those who left.
  const syncPeers = useCallback(() => {
    const wanted = new Set(nearbyRef.current);

    for (const id of wanted) {
      // Only ONE side starts the call: the smaller socket id.
      if (!peersRef.current.has(id) && myIdRef.current < id) startCall(id);
    }

    for (const [id, peer] of peersRef.current) {
      const isYoung = Date.now() - peer.createdAt < GRACE_MS;
      if (!wanted.has(id) && !isYoung) closePeer(id);
    }
  }, [startCall, closePeer]);

  // ---------- Run the sync when the nearby list changes ----------
  // (and once per second, to close "young" connections after the grace time)
  useEffect(() => {
    syncPeers();
    const timer = setInterval(syncPeers, 1000);
    return () => clearInterval(timer);
  }, [nearbyIds, syncPeers]);

  // ---------- Handle signal messages from the server ----------
  useEffect(() => {
    async function onOffer({ from, offer }) {
      closePeer(from); // a new offer means "start fresh"
      const peer = createPeer(from, false);
      try {
        await peer.pc.setRemoteDescription(offer);
        await flushCandidates(peer);

        // Reply with a two-way audio slot (and my mic, if it is on).
        const transceiver = getAudioTransceiver(peer.pc);
        transceiver.direction = "sendrecv";
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) await transceiver.sender.replaceTrack(track);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        socket.emit(EVENTS.SIGNAL_ANSWER, {
          to: from,
          answer: peer.pc.localDescription,
        });
      } catch (error) {
        console.error("Could not answer offer:", error);
        closePeer(from);
      }
    }

    async function onAnswer({ from, answer }) {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      try {
        await peer.pc.setRemoteDescription(answer);
        await flushCandidates(peer);
      } catch (error) {
        console.error("Could not apply answer:", error);
      }
    }

    async function onIce({ from, candidate }) {
      const peer = peersRef.current.get(from);
      if (!peer || !candidate) return;

      // Candidates can arrive before the offer/answer is processed.
      // Keep them in a waiting list until we can use them.
      if (!peer.pc.remoteDescription) {
        peer.pendingCandidates.push(candidate);
      } else {
        await peer.pc.addIceCandidate(candidate).catch(() => {});
      }
    }

    // If we lose the server, our old connections are useless.
    function closeAll() {
      for (const id of Array.from(peersRef.current.keys())) closePeer(id);
    }

    socket.on(EVENTS.SIGNAL_OFFER, onOffer);
    socket.on(EVENTS.SIGNAL_ANSWER, onAnswer);
    socket.on(EVENTS.SIGNAL_ICE, onIce);
    socket.on("disconnect", closeAll);

    return () => {
      socket.off(EVENTS.SIGNAL_OFFER, onOffer);
      socket.off(EVENTS.SIGNAL_ANSWER, onAnswer);
      socket.off(EVENTS.SIGNAL_ICE, onIce);
      socket.off("disconnect", closeAll);
      closeAll();
    };
  }, [socket, createPeer, closePeer]);

  // ---------- Mic turned on/off: swap the track in every connection ----------
  useEffect(() => {
    const track = localStream?.getAudioTracks()[0] || null;
    for (const { pc } of peersRef.current.values()) {
      getAudioTransceiver(pc)?.sender.replaceTrack(track).catch(() => {});
    }
  }, [localStream]);

  return { remoteStreams, peerStates };
}
