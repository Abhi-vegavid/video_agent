import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Avatar } from "./Avatar";

export const Experience = ({ agentAudioStream, visemePacket }) => {
  const texture = useTexture("textures/youtubeBackground.jpg");
  const viewport = useThree((state) => state.viewport);

  return (
    <>
      {/* <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} /> */}
      <Avatar
        position={[0, -3, 5]}
        scale={2}
        audioStream={agentAudioStream}
        visemePacket={visemePacket}
      />
      <Environment preset="sunset" />
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </>
  );
};
