import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";

function App() {
  return (
    
    <Canvas 
    shadows 
    camera={{ position: [0, 0, 8], fov: 42 }}
     style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#ececec"]} />
      <Experience />
    </Canvas>
    
  );
}

export default App;
