import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { Experience } from "./components/Experience";

function App() {
  const [micEnabled, setMicEnabled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentAudioStream, setAgentAudioStream] = useState(null);
  const [visemePacket, setVisemePacket] = useState(null);
  const [voiceError, setVoiceError] = useState("");

  const roomRef = useRef(null);
  const audioElementsRef = useRef([]);
  const micIntentRef = useRef(false);
  const dispatchPromiseRef = useRef(null);

  const toggleMic = useCallback(() => {
    setMicEnabled((v) => !v);
  }, []);

  const cleanupRoom = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      try {
        room.removeAllListeners();
        await room.disconnect();
      } catch (error) {
        console.error("LiveKit cleanup error:", error);
      }
      roomRef.current = null;
    }

    audioElementsRef.current.forEach((audio) => {
      try {
        audio.pause();
        audio.remove();
      } catch (error) {
        console.error("Audio cleanup error:", error);
      }
    });
    audioElementsRef.current = [];
    setVoiceConnected(false);
    setAgentReady(false);
    setAgentAudioStream(null);
    setVisemePacket(null);
  }, []);

  const dispatchAgentOnce = useCallback(async (backendUrl) => {
    if (!dispatchPromiseRef.current) {
      dispatchPromiseRef.current = fetch(`${backendUrl}/dispatch-agent`, {
        method: "POST",
      }).catch((error) => {
        // allow retry next time if dispatch failed
        dispatchPromiseRef.current = null;
        throw error;
      });
    }
    return dispatchPromiseRef.current;
  }, []);

  const connectVoice = useCallback(async () => {
    if (isConnecting || roomRef.current) return;

    setIsConnecting(true);
    setVoiceError("");
    setAgentReady(false);

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";
      const LIVEKIT_URL =
        import.meta.env.VITE_LIVEKIT_URL ?? "ws://127.0.0.1:7880";
      const sessionId =
        window.localStorage.getItem("video_agent_session_id") ?? "";

      // Warm agent dispatch in parallel with token/room setup.
      const dispatchTask = dispatchAgentOnce(BACKEND_URL);

      const tokenResponse = await fetch(
        `${BACKEND_URL}/generate-voice-token?session_id=${encodeURIComponent(
          sessionId
        )}`
      );
      if (!tokenResponse.ok) {
        throw new Error(`Token request failed (${tokenResponse.status})`);
      }

      const { token } = await tokenResponse.json();
      if (!token) {
        throw new Error("Missing LiveKit token");
      }
      if (!micIntentRef.current) return;

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
      });
      roomRef.current = room;

      room.on(RoomEvent.Disconnected, () => {
        setVoiceConnected(false);
        setAgentReady(false);
        setAgentAudioStream(null);
        setVisemePacket(null);
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        // User can start speaking as soon as remote agent joins.
        if (!participant?.isLocal) {
          setAgentReady(true);
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;

        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.controls = false;
        audio.muted = false;
        audio.setAttribute("playsinline", "true");
        track.attach(audio);
        document.body.appendChild(audio);
        audioElementsRef.current.push(audio);

        setTimeout(() => {
          audio.play().catch(() => {});
        }, 100);

        if (!participant?.isLocal && track.mediaStreamTrack) {
          setAgentAudioStream(new MediaStream([track.mediaStreamTrack]));
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        if (!participant?.isLocal) {
          setAgentAudioStream(null);
        }
      });

      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (participant?.isLocal) return;
        if (topic && topic !== "viseme") return;

        try {
          const text = new TextDecoder().decode(payload);
          const packet = JSON.parse(text);
          if (packet?.type !== "viseme") return;

          setVisemePacket({
            name: packet.name ?? "aa",
            value: Number(packet.value ?? 0),
            t: Number(packet.t ?? Date.now() / 1000),
            attack: Number(packet.attack ?? 0.52),
            release: Number(packet.release ?? 0.34),
            blend: Number(packet.blend ?? 0.88),
            holdMs: Number(packet.hold_ms ?? 120),
          });
        } catch (error) {
          console.warn("Invalid viseme packet:", error);
        }
      });

      await room.connect(LIVEKIT_URL, token);
      setVoiceConnected(true);

      await room.localParticipant.setMicrophoneEnabled(true);
      await dispatchTask;

      // Agent may already be in room before this listener fired.
      const hasRemoteParticipants = [...room.remoteParticipants.values()].length > 0;
      if (hasRemoteParticipants) {
        setAgentReady(true);
      }
    } catch (error) {
      console.error("Voice connection error:", error);
      setVoiceError("Unable to connect voice right now.");
      await cleanupRoom();
    } finally {
      setIsConnecting(false);
    }
  }, [cleanupRoom, dispatchAgentOnce, isConnecting]);

  useEffect(() => {
    micIntentRef.current = micEnabled;
    if (micEnabled) {
      connectVoice();
    } else {
      cleanupRoom();
      setVoiceError("");
    }
  }, [cleanupRoom, connectVoice, micEnabled]);

  useEffect(() => {
    const BACKEND_URL =
      import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";

    // Pre-warm dispatch during initial load to reduce first-response latency.
    dispatchAgentOnce(BACKEND_URL).catch((error) => {
      console.warn("Agent pre-dispatch failed:", error);
    });
  }, [dispatchAgentOnce]);

  useEffect(() => {
    return () => {
      cleanupRoom();
    };
  }, [cleanupRoom]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 42 }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#ececec"]} />
        <Experience agentAudioStream={agentAudioStream} visemePacket={visemePacket} />
      </Canvas>

      <button
        type="button"
        onClick={toggleMic}
        aria-pressed={micEnabled}
        disabled={isConnecting}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          background: micEnabled ? "#111827" : "#ffffff",
          color: micEnabled ? "#ffffff" : "#111827",
          fontSize: 14,
          fontWeight: 600,
          cursor: isConnecting ? "not-allowed" : "pointer",
          opacity: isConnecting ? 0.65 : 1,
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        }}
      >
        {isConnecting ? "Connecting..." : micEnabled ? "Stop Mic" : "Start Mic"}
      </button>

      {(voiceConnected || voiceError) && (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 16,
            zIndex: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: voiceError ? "#7f1d1d" : "#065f46",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {voiceError ||
            (agentReady
              ? "LiveKit connected. Agent ready - speak now."
              : "LiveKit connected. Waiting for agent...")}
        </div>
      )}
    </div>
  );
}

export default App;
