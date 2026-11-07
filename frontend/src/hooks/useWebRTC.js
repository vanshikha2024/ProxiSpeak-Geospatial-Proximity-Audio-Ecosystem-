
import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../network/socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};
const MAX_PEER_CONNECTIONS = 8;

export function useWebRTC(localSocketId, users = []) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatuses, setConnectionStatuses] = useState({});
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuteStatuses, setRemoteMuteStatuses] = useState({});

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const usersRef = useRef(users);
  const audioStartedRef = useRef(false);
  const pendingIceRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());
  const audioAnalyzersRef = useRef(new Map());
  const speakingAnimationRef = useRef(null);
  const pendingPeersRef = useRef(new Set());

  // Keep the latest room-user information available.
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Check whether a teammate is currently within audio range.
  const isPeerNearby = useCallback((peerSocketId) => {
    return usersRef.current.some(
      (user) =>
        user.socketId === peerSocketId &&
        user.isNearby === true
    );
  }, []);

  const detectSpeaking = useCallback(() => {
    const speakingThreshold = 12;

    audioAnalyzersRef.current.forEach(({ analyser }, peerSocketId) => {
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);

      let sum = 0;

      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const isSpeaking = rms * 100 > speakingThreshold;

      setSpeakingUsers((current) => {
        if (current[peerSocketId] === isSpeaking) {
          return current;
        }

        return { ...current, [peerSocketId]: isSpeaking };
      });
    });

    speakingAnimationRef.current =
      requestAnimationFrame(detectSpeaking);
  }, []);

  useEffect(() => {
    speakingAnimationRef.current =
      requestAnimationFrame(detectSpeaking);

    return () => {
      if (speakingAnimationRef.current !== null) {
        cancelAnimationFrame(speakingAnimationRef.current);
      }
    };
  }, [detectSpeaking]);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Microphone access requires HTTPS or localhost."
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    localStreamRef.current = stream;
    setLocalStream(stream);

    return stream;
  }, []);

  const closePeer = useCallback((peerSocketId) => {
    const peer = peersRef.current.get(peerSocketId);
    pendingPeersRef.current.delete(peerSocketId);

    if (peer) {
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
      peersRef.current.delete(peerSocketId);
    }

    pendingIceRef.current.delete(peerSocketId);
    pendingOffersRef.current.delete(peerSocketId);

    const analyzer = audioAnalyzersRef.current.get(peerSocketId);

    if (analyzer) {
      analyzer.source.disconnect();
      analyzer.analyser.disconnect();
      analyzer.context.close().catch(() => {});
      audioAnalyzersRef.current.delete(peerSocketId);
    }

    setSpeakingUsers((current) => {
      const next = { ...current };
      delete next[peerSocketId];
      return next;
    });

    setRemoteStreams((current) =>
      current.filter((item) => item.socketId !== peerSocketId)
    );

    setConnectionStatuses((current) => {
      const next = { ...current };
      delete next[peerSocketId];
      return next;
    });

    setRemoteMuteStatuses((current) => {
      const next = { ...current };
      delete next[peerSocketId];
      return next;
    });
  }, []);

  const flushPendingIce = useCallback(async (peerSocketId, pc) => {
    if (!pc.remoteDescription) return;

    const candidates =
      pendingIceRef.current.get(peerSocketId) || [];

    pendingIceRef.current.delete(peerSocketId);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("[WebRTC] Could not add queued ICE:", error);
      }
    }
  }, []);

  const createPeer = useCallback(
    async (peerSocketId, makeOffer) => {
      if (
        !peerSocketId ||
        peerSocketId === socket.id ||
        peerSocketId === localSocketId ||
        !isPeerNearby(peerSocketId)
      ) {
        return null;
      }

      if (peersRef.current.has(peerSocketId)) {
        return peersRef.current.get(peerSocketId).pc;
      }

      if (pendingPeersRef.current.has(peerSocketId)) {
        return null;
      }

      const pendingCount = [...pendingPeersRef.current].filter(
        (id) => !peersRef.current.has(id)
      ).length;

      if (peersRef.current.size + pendingCount >= MAX_PEER_CONNECTIONS) {
        console.log("[WebRTC] Maximum audio connections reached.");
        return null;
      }

      pendingPeersRef.current.add(peerSocketId);

      let stream;

      try {
        stream = await getLocalStream();
      } catch (error) {
        pendingPeersRef.current.delete(peerSocketId);
        throw error;
      }

      // The teammate may have moved while microphone permission
      // was being requested.
      if (!audioStartedRef.current || !isPeerNearby(peerSocketId)) {
        pendingPeersRef.current.delete(peerSocketId);
        return null;
      }

      if (peersRef.current.has(peerSocketId)) {
        pendingPeersRef.current.delete(peerSocketId);
        return peersRef.current.get(peerSocketId).pc;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      peersRef.current.set(peerSocketId, { pc });
      pendingPeersRef.current.delete(peerSocketId);

      setConnectionStatuses((current) => ({
        ...current,
        [peerSocketId]: "connecting",
      }));

      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate || !socket.connected) return;
        if (!isPeerNearby(peerSocketId)) return;

        socket.emit("signal:ice", {
          toSocketId: peerSocketId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const remoteStream =
          event.streams?.[0] ||
          new MediaStream([event.track]);

        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;

        if (AudioContextClass) {
          try {
            const context = new AudioContextClass();
            const source =
              context.createMediaStreamSource(remoteStream);
            const analyser = context.createAnalyser();

            analyser.fftSize = 512;
            source.connect(analyser);

            audioAnalyzersRef.current
              .get(peerSocketId)?.context.close();

            audioAnalyzersRef.current.set(peerSocketId, {
              context,
              source,
              analyser,
            });

            if (context.state === "suspended") {
              context.resume().catch(console.error);
            }
          } catch (error) {
            console.error(
              "[WebRTC] Could not analyze remote audio:",
              error
            );
          }
        }

        setRemoteStreams((current) => {
          const existing = current.find(
            (item) => item.socketId === peerSocketId
          );

          if (existing) {
            return current.map((item) =>
              item.socketId === peerSocketId
                ? { ...item, stream: remoteStream }
                : item
            );
          }

          return [
            ...current,
            { socketId: peerSocketId, stream: remoteStream },
          ];
        });
      };

      pc.onconnectionstatechange = () => {
        const status = pc.connectionState;

        console.log(`[WebRTC] Peer ${peerSocketId}:`, status);

        setConnectionStatuses((current) => ({
          ...current,
          [peerSocketId]: status,
        }));

        if (status === "failed" || status === "closed") {
          closePeer(peerSocketId);
        }
      };

      if (makeOffer) {
        if (!socket.connected || !isPeerNearby(peerSocketId)) {
          closePeer(peerSocketId);
          return null;
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (!socket.connected || !isPeerNearby(peerSocketId)) {
          closePeer(peerSocketId);
          return null;
        }

        socket.emit("signal:offer", {
          toSocketId: peerSocketId,
          offer: pc.localDescription,
        });
      }

      return pc;
    },
    [
      localSocketId,
      getLocalStream,
      closePeer,
      isPeerNearby,
    ]
  );

  const acceptOffer = useCallback(
    async (fromSocketId, offer) => {
      if (!audioStartedRef.current) {
        pendingOffersRef.current.set(fromSocketId, offer);
        return;
      }

      if (!isPeerNearby(fromSocketId)) {
        return;
      }

      try {
        let pc = peersRef.current.get(fromSocketId)?.pc;

        if (pc && pc.signalingState !== "stable") {
          console.warn(
            "[WebRTC] Offer collision with:",
            fromSocketId
          );
          return;
        }

        if (!pc) {
          if (
            peersRef.current.size + pendingPeersRef.current.size >=
              MAX_PEER_CONNECTIONS ||
            pendingPeersRef.current.has(fromSocketId)
          ) {
            pendingOffersRef.current.set(fromSocketId, offer);
            console.log(
              "[WebRTC] Audio offer queued; connection limit reached:",
              fromSocketId
            );
            return;
          }

          pc = await createPeer(fromSocketId, false);
        }

        if (!pc || !isPeerNearby(fromSocketId)) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        await flushPendingIce(fromSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (!isPeerNearby(fromSocketId)) {
          closePeer(fromSocketId);
          return;
        }

        socket.emit("signal:answer", {
          toSocketId: fromSocketId,
          answer: pc.localDescription,
        });

        console.log("[WebRTC] Answer sent to:", fromSocketId);
      } catch (error) {
        console.error("[WebRTC] Offer handling failed:", error);
      }
    },
    [createPeer, flushPendingIce, isPeerNearby, closePeer]
  );

  // Manage peers dynamically as users enter and leave audio range.
  useEffect(() => {
    const currentSocketId = localSocketId || socket.id;

    if (
      !audioStartedRef.current ||
      !socket.connected ||
      !currentSocketId
    ) {
      return;
    }

    const nearbyUsers = users.filter(
      (user) =>
        user.socketId &&
        user.socketId !== currentSocketId &&
        user.isNearby === true
    );

    const nearbyIds = new Set(
      nearbyUsers.map((user) => user.socketId)
    );

    // Close connections to users who moved outside audio range.
    [...peersRef.current.keys()].forEach((peerSocketId) => {
      if (!nearbyIds.has(peerSocketId)) {
        console.log(
          "[WebRTC] Closing out-of-range peer:",
          peerSocketId
        );

        closePeer(peerSocketId);
      }
    });

    // Accept queued offers when audio connection slots become available.
    for (const [peerSocketId, offer] of pendingOffersRef.current) {
      if (
        peersRef.current.size + pendingPeersRef.current.size >=
        MAX_PEER_CONNECTIONS
      ) {
        break;
      }

      if (pendingPeersRef.current.has(peerSocketId)) {
        continue;
      }

      if (!nearbyIds.has(peerSocketId)) {
        pendingOffersRef.current.delete(peerSocketId);
        continue;
      }

      if (peersRef.current.has(peerSocketId)) {
        pendingOffersRef.current.delete(peerSocketId);
        continue;
      }

      pendingOffersRef.current.delete(peerSocketId);

      acceptOffer(peerSocketId, offer).catch((error) => {
        console.error("[WebRTC] Could not process queued offer:", error);
      });
    }

    // Only the lower socket ID initiates the offer.
    nearbyUsers.forEach((user) => {
      if (
        currentSocketId.localeCompare(user.socketId) < 0 &&
        !peersRef.current.has(user.socketId)
      ) {
        createPeer(user.socketId, true).catch((error) => {
          console.error(
            "[WebRTC] Could not connect to nearby user:",
            user.socketId,
            error
          );
        });
      }
    });
  }, [
    users,
    localSocketId,
    createPeer,
    closePeer,
    acceptOffer,
    connectionStatuses,
  ]);

  useEffect(() => {
    async function handleOffer({ fromSocketId, offer } = {}) {
      if (!fromSocketId || !offer) return;
      await acceptOffer(fromSocketId, offer);
    }

    async function handleAnswer({ fromSocketId, answer } = {}) {
      if (!fromSocketId || !answer) return;

      const pc = peersRef.current.get(fromSocketId)?.pc;

      if (!pc || !answer) return;

      if (!isPeerNearby(fromSocketId)) {
        closePeer(fromSocketId);
        return;
      }

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        await flushPendingIce(fromSocketId, pc);

        console.log("[WebRTC] Answer received from:", fromSocketId);
      } catch (error) {
        console.error("[WebRTC] Answer handling failed:", error);
      }
    }

    async function handleIce({ fromSocketId, candidate } = {}) {
      if (!fromSocketId || !candidate) return;

      if (!isPeerNearby(fromSocketId)) return;

      const pc = peersRef.current.get(fromSocketId)?.pc;

      if (!pc || !pc.remoteDescription) {
        const queued =
          pendingIceRef.current.get(fromSocketId) || [];

        queued.push(candidate);
        pendingIceRef.current.set(fromSocketId, queued);
        return;
      }

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("[WebRTC] ICE handling failed:", error);
      }
    }

    function handleAvatarLeft({ socketId, avatarId } = {}) {
      const peerSocketId = socketId || avatarId;
      if (peerSocketId) closePeer(peerSocketId);
    }

    function handleVoiceLeft({ socketId } = {}) {
      if (socketId) {
        console.log("[WebRTC] User left voice:", socketId);
        closePeer(socketId);
      }
    }

    function handleVoiceMuteChanged({ socketId, isMuted } = {}) {
      if (!socketId || typeof isMuted !== "boolean") return;

      setRemoteMuteStatuses((previous) => ({
        ...previous,
        [socketId]: isMuted,
      }));
    }

    socket.on("signal:offer", handleOffer);
    socket.on("signal:answer", handleAnswer);
    socket.on("signal:ice", handleIce);
    socket.on("avatar:left", handleAvatarLeft);
    socket.on("voice:left", handleVoiceLeft);
    socket.on("voice:mute:changed", handleVoiceMuteChanged);

    return () => {
      socket.off("signal:offer", handleOffer);
      socket.off("signal:answer", handleAnswer);
      socket.off("signal:ice", handleIce);
      socket.off("avatar:left", handleAvatarLeft);
      socket.off("voice:left", handleVoiceLeft);
      socket.off("voice:mute:changed", handleVoiceMuteChanged);
    };
  }, [
    acceptOffer,
    closePeer,
    flushPendingIce,
    isPeerNearby,
  ]);

  const startAudio = useCallback(async () => {
    if (audioStartedRef.current) return;

    await getLocalStream();

    audioStartedRef.current = true;

    // Handle only pending offers from users still nearby.
    const pendingOffers = [
      ...pendingOffersRef.current.entries(),
    ];

    pendingOffersRef.current.clear();

    for (const [peerSocketId, offer] of pendingOffers) {
      if (isPeerNearby(peerSocketId)) {
        await acceptOffer(peerSocketId, offer);
      }
    }

    const currentSocketId = localSocketId || socket.id;

    // Only initiate connections with nearby users.
    const nearbyUsers = usersRef.current.filter(
      (user) =>
        user.socketId &&
        user.socketId !== currentSocketId &&
        user.isNearby === true &&
        currentSocketId.localeCompare(user.socketId) < 0
    );

    for (const user of nearbyUsers) {
      if (peersRef.current.has(user.socketId)) continue;

      try {
        await createPeer(user.socketId, true);
      } catch (error) {
        console.error(
          "[WebRTC] Could not connect to nearby user:",
          user.socketId,
          error
        );
      }
    }
  }, [
    getLocalStream,
    acceptOffer,
    createPeer,
    isPeerNearby,
    localSocketId,
  ]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextMuted = !isMuted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setIsMuted(nextMuted);

    socket.emit("voice:mute", {
      isMuted: nextMuted,
    });
  }, [isMuted]);

  const leaveVoice = useCallback(() => {
    audioStartedRef.current = false;

    socket.emit("voice:leave");

    [...peersRef.current.keys()].forEach((peerSocketId) => {
      closePeer(peerSocketId);
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    localStreamRef.current = null;

    setLocalStream(null);
    setRemoteStreams([]);
    setConnectionStatuses({});
    setSpeakingUsers({});
    setRemoteMuteStatuses({});
    setIsMuted(false);

    pendingIceRef.current.clear();
    pendingOffersRef.current.clear();
    pendingPeersRef.current.clear();
  }, [closePeer]);

  useEffect(() => {
    return () => {
      audioStartedRef.current = false;

      peersRef.current.forEach(({ pc }) => {
        pc.close();
      });

      peersRef.current.clear();
      pendingIceRef.current.clear();
      pendingOffersRef.current.clear();
      pendingPeersRef.current.clear();

      audioAnalyzersRef.current.forEach(({ source, analyser, context }) => {
        source.disconnect();
        analyser.disconnect();
        context.close().catch(() => {});
      });

      audioAnalyzersRef.current.clear();

      localStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    connectionStatuses,
    speakingUsers,
    remoteMuteStatuses,
    startAudio,
    isMuted,
    toggleMute,
    leaveVoice,
  };
}
