/*
Clean version: Real-time mic lipsync (no JSON/audio files)
*/

import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";

const MOUTH_NAMES = ["mouthOpen", "viseme_aa", "viseme_AA", "A", "aa"];

function getMouthIndex(dict) {
  if (!dict) return undefined;
  for (const name of MOUTH_NAMES) {
    if (dict[name] !== undefined) return dict[name];
  }
  return undefined;
}

export function Avatar({ micEnabled = false, ...props }) {
  const { nodes, materials } = useGLTF(
    "/models/646d9dcdc8a5f5bddbfac913.glb"
  );
  const headRef = useRef();
  const teethRef = useRef();
  const mouthIndexRef = useRef(null);
  const teethMouthIndexRef = useRef(null);
  const { animations: idleAnimation } = useFBX("/animations/Idle.fbx");
  const { animations: angryAnimation } = useFBX(
    "/animations/Angry Gesture.fbx"
  );
  const { animations: greetingAnimation } = useFBX(
    "/animations/Standing Greeting.fbx"
  );

  idleAnimation[0].name = "Idle";
  angryAnimation[0].name = "Angry";
  greetingAnimation[0].name = "Greeting";

  const [animation, setAnimation] = useState("Idle");
  const group = useRef();

  const { actions } = useAnimations(
    [idleAnimation[0], angryAnimation[0], greetingAnimation[0]],
    group
  );

  // 🎤 MIC STREAM
  const [stream, setStream] = useState(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!micEnabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
})) {
      console.error("getUserMedia is not supported in this browser");
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
      })
      .catch((err) => {
        console.error("Mic access denied:", err);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setStream(null);
      });

    return () => {
      cancelled = true;
    };
  }, [micEnabled]);

  // 🔊 AUDIO ANALYSER
  const volume = useAudioAnalyser(stream);

  // Stable morph arrays so re-renders don't reset lip sync
  const headInfluences = useMemo(
    () =>
      nodes.Wolf3D_Head?.morphTargetInfluences
        ? [...nodes.Wolf3D_Head.morphTargetInfluences]
        : [],
    [nodes.Wolf3D_Head]
  );
  const teethInfluences = useMemo(
    () =>
      nodes.Wolf3D_Teeth?.morphTargetInfluences
        ? [...nodes.Wolf3D_Teeth.morphTargetInfluences]
        : [],
    [nodes.Wolf3D_Teeth]
  );

  // 🎭 ANIMATION CONTROL
  useEffect(() => {
    if (!actions || !actions[animation]) return;
    actions[animation].reset().fadeIn(0.5).play();
    return () => actions[animation].fadeOut(0.5);
  }, [animation, actions]);

  // 🎯 FRAME LOOP (LIPSYNC + HEAD FOLLOW)
  useFrame((state) => {
    const headMesh = headRef.current;
    const teethMesh = teethRef.current;
    if (!headMesh) return;

    const dict = headMesh.morphTargetDictionary;
    if (mouthIndexRef.current === null) {
      mouthIndexRef.current = getMouthIndex(dict);
      if (teethMesh?.morphTargetDictionary) {
        teethMouthIndexRef.current = getMouthIndex(
          teethMesh.morphTargetDictionary
        );
      }
      if (mouthIndexRef.current === undefined && dict) {
        console.log(
          "Lip sync: no matching mouth morph. Head keys:",
          Object.keys(dict)
        );
      }
    }
    const index = mouthIndexRef.current;

    if (index !== undefined) {
      const current = headMesh.morphTargetInfluences[index];
      // 🔊 amplify
      let amplified = volume * 3;

      // ✂️ noise gate
      if (amplified < 0.1) amplified = 0;

      // 🎯 clamp
      amplified = Math.min(amplified, 1);

      // 🧠 smooth
      const smoothed = THREE.MathUtils.lerp(current, amplified, 0.5);

      // 👄 apply
      headMesh.morphTargetInfluences[index] = smoothed;

      // 🦷 sync teeth
      if (teethMesh && teethMouthIndexRef.current !== undefined) {
        teethMesh.morphTargetInfluences[teethMouthIndexRef.current] = smoothed;
      }
    }

    // 👀 head follow
    const headBone = group.current?.getObjectByName("Head");
    if (headBone) {
      headBone.lookAt(state.camera.position);
    }
  });


  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />

      <skinnedMesh
        geometry={nodes.Wolf3D_Body.geometry}
        material={materials.Wolf3D_Body}
        skeleton={nodes.Wolf3D_Body.skeleton}
      />

      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
        material={materials.Wolf3D_Outfit_Bottom}
        skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
      />

      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
        material={materials.Wolf3D_Outfit_Footwear}
        skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
      />

      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Top.geometry}
        material={materials.Wolf3D_Outfit_Top}
        skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
      />

      <skinnedMesh
        geometry={nodes.Wolf3D_Hair.geometry}
        material={materials.Wolf3D_Hair}
        skeleton={nodes.Wolf3D_Hair.skeleton}
      />

      <skinnedMesh
        name="EyeLeft"
        geometry={nodes.EyeLeft.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeLeft.skeleton}
        morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
      />

      <skinnedMesh
        name="EyeRight"
        geometry={nodes.EyeRight.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeRight.skeleton}
        morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
      />

      <skinnedMesh
        ref={headRef}
        name="Wolf3D_Head"
        geometry={nodes.Wolf3D_Head.geometry}
        material={materials.Wolf3D_Skin}
        skeleton={nodes.Wolf3D_Head.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={headInfluences}
      />

      <skinnedMesh
        ref={teethRef}
        name="Wolf3D_Teeth"
        geometry={nodes.Wolf3D_Teeth.geometry}
        material={materials.Wolf3D_Teeth}
        skeleton={nodes.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={teethInfluences}
      />
    </group>
  );
}

useGLTF.preload("/models/646d9dcdc8a5f5bddbfac913.glb");