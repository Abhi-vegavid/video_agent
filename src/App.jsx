import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { Experience } from "./components/Experience";

function App() {
  const [micEnabled, setMicEnabled] = useState(false);

  const toggleMic = useCallback(() => {
    setMicEnabled((v) => !v);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 42 }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#ececec"]} />
        <Experience micEnabled={micEnabled} />
      </Canvas>

      <button
        type="button"
        onClick={toggleMic}
        aria-pressed={micEnabled}
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
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        }}
      >
        {micEnabled ? "Stop Mic" : "Start Mic"}
      </button>
    </div>
  );
}

export default App;
