
import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../network/socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export function useWebRTC(localSocketId, users = []) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const usersRef = useRef(users);
  const audioStartedRef = useRef(false);
  const pendingIceRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Request microphone access only when voice is started.
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

    if (peer) {
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();

      peersRef.current.delete(peerSocketId);
    }

    pendingIceRef.current.delete(peerSocketId);
    pendingOffersRef.current.delete(peerSocketId);

    setRemoteStreams((current) =>
      current.filter((item) => item.socketId !== peerSocketId)
    );
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
        console.error(
          "[WebRTC] Could not add queued ICE candidate:",
          error
        );
      }
    }
  }, []);

  const createPeer = useCallback(
    async (peerSocketId, makeOffer) => {
      if (
        !peerSocketId ||
        peerSocketId === socket.id ||
        peerSocketId === localSocketId
      ) {
        return null;
      }

      if (peersRef.current.has(peerSocketId)) {
        return peersRef.current.get(peerSocketId).pc;
      }

      const stream = await getLocalStream();

      // Avoid creating a duplicate peer if another async
      // operation created it while microphone access was pending.
      if (peersRef.current.has(peerSocketId)) {
        return peersRef.current.get(peerSocketId).pc;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      peersRef.current.set(peerSocketId, { pc });

      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;

        if (!socket.connected) {
          console.warn("[WebRTC] Socket disconnected; ICE not sent.");
          return;
        }

        socket.emit("signal:ice", {
          tosocketId: peerSocketId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const remoteStream =
          event.streams?.[0] ||
          new MediaStream([event.track]);

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
            {
              socketId: peerSocketId,
              stream: remoteStream,
            },
          ];
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `[WebRTC] Peer ${peerSocketId}:`,
          pc.connectionState
        );

        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          closePeer(peerSocketId);
        }
      };

      if (makeOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("signal:offer", {
          tosocketId: peerSocketId,
          offer: pc.localDescription,
        });
      }

      return pc;
    },
    [localSocketId, getLocalStream, closePeer]
  );

  const acceptOffer = useCallback(
    async (fromSocketId, offer) => {
      if (!audioStartedRef.current) {
        // Wait for the user to click Start Voice.
        pendingOffersRef.current.set(fromSocketId, offer);
        return;
      }

      try {
        let pc = peersRef.current.get(fromSocketId)?.pc;

        // If we already made an offer, avoid replacing an
        // in-progress connection unnecessarily.
        if (pc && pc.signalingState !== "stable") {
          console.warn(
            "[WebRTC] Offer collision with:",
            fromSocketId
          );
          return;
        }

        if (!pc) {
          pc = await createPeer(fromSocketId, false);
        }

        if (!pc) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        await flushPendingIce(fromSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("signal:answer", {
          tosocketId: fromSocketId,
          answer: pc.localDescription,
        });

        console.log(
          "[WebRTC] Answer sent to:",
          fromSocketId
        );
      } catch (error) {
        console.error(
          "[WebRTC] Offer handling failed:",
          error
        );
      }
    },
    [createPeer, flushPendingIce]
  );

  useEffect(() => {
    async function handleOffer({
      fromSocketId,
      offer,
    } = {}) {
      if (!fromSocketId || !offer) return;

      await acceptOffer(fromSocketId, offer);
    }

    async function handleAnswer({
      fromSocketId,
      answer,
    } = {}) {
      const pc = peersRef.current.get(fromSocketId)?.pc;

      if (!pc || !answer) return;

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        await flushPendingIce(fromSocketId, pc);

        console.log(
          "[WebRTC] Answer received from:",
          fromSocketId
        );
      } catch (error) {
        console.error(
          "[WebRTC] Answer handling failed:",
          error
        );
      }
    }

    async function handleIce({
      fromSocketId,
      candidate,
    } = {}) {
      if (!fromSocketId || !candidate) return;

      const pc = peersRef.current.get(fromSocketId)?.pc;

      // Candidates can arrive before an offer or answer
      // has established the remote description.
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
        console.error(
          "[WebRTC] ICE candidate handling failed:",
          error
        );
      }
    }

    function handleAvatarJoined(avatar = {}) {
      if (!audioStartedRef.current) return;

      if (avatar.socketId) {
        createPeer(avatar.socketId, true).catch((error) => {
          console.error(
            "[WebRTC] Could not connect to new user:",
            error
          );
        });
      }
    }

    function handleAvatarLeft({
      socketId,
      avatarId,
    } = {}) {
      const peerSocketId = socketId || avatarId;

      if (peerSocketId) {
        closePeer(peerSocketId);
      }
    }

    socket.on("signal:offer", handleOffer);
    socket.on("signal:answer", handleAnswer);
    socket.on("signal:ice", handleIce);
    socket.on("avatar:joined", handleAvatarJoined);
    socket.on("avatar:left", handleAvatarLeft);

    return () => {
      socket.off("signal:offer", handleOffer);
      socket.off("signal:answer", handleAnswer);
      socket.off("signal:ice", handleIce);
      socket.off("avatar:joined", handleAvatarJoined);
      socket.off("avatar:left", handleAvatarLeft);
    };
  }, [
    acceptOffer,
    createPeer,
    closePeer,
    flushPendingIce,
  ]);

  const startAudio = useCallback(async () => {
    if (audioStartedRef.current) return;

    // Request microphone permission from the button action.
    await getLocalStream();

    audioStartedRef.current = true;

    // Process offers received before this user started voice.
    const pendingOffers = [
      ...pendingOffersRef.current.entries(),
    ];

    pendingOffersRef.current.clear();

    for (const [peerSocketId, offer] of pendingOffers) {
      await acceptOffer(peerSocketId, offer);
    }

    // Connect to users already present in the room.
    const peers = usersRef.current.filter(
      (user) =>
        user.socketId &&
        user.socketId !== socket.id &&
        user.socketId !== localSocketId
    );

    for (const user of peers) {
      // If a pending offer already created this peer,
      // do not initiate another offer.
      if (peersRef.current.has(user.socketId)) continue;

      try {
        await createPeer(user.socketId, true);
      } catch (error) {
        console.error(
          "[WebRTC] Could not connect to user:",
          user.socketId,
          error
        );
      }
    }
  }, [
    getLocalStream,
    createPeer,
    acceptOffer,
    localSocketId,
  ]);

  useEffect(() => {
    return () => {
      audioStartedRef.current = false;

      peersRef.current.forEach(({ pc }) => {
        pc.close();
      });

      peersRef.current.clear();
      pendingIceRef.current.clear();
      pendingOffersRef.current.clear();

      localStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    startAudio,
  };
}
