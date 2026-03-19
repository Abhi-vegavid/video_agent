/*
Clean version: Real-time mic lipsync (no JSON/audio files)
*/

import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";

const MOUTH_NAMES = ["mouthOpen", "viseme_aa", "viseme_AA", "A", "aa"];
const EYES_CLOSED_NAMES = ["eyesClosed", "eyeClosed", "EyeBlink", "blink"];
const EYES_LOOK_UP_NAMES = ["eyesLookUp", "eyeLookUp", "lookUp"];
const EYES_LOOK_DOWN_NAMES = ["eyesLookDown", "eyeLookDown", "lookDown"];
const DEFAULT_VISEME_TIMEOUT_MS = 220;

function getFirstIndex(dict, names) {
  if (!dict) return undefined;
  for (const name of names) {
    if (dict[name] !== undefined) return dict[name];
  }
  return undefined;
}

function buildVisemeCandidates(name) {
  const normalized = String(name ?? "aa").trim();
  const lower = normalized.toLowerCase();
  const upper = normalized.toUpperCase();
  return [
    normalized,
    lower,
    upper,
    `viseme_${lower}`,
    `viseme_${upper}`,
    `viseme-${lower}`,
    `viseme-${upper}`,
    "mouthOpen",
  ];
}

export function Avatar({ audioStream = null, visemePacket = null, ...props }) {
  const { nodes, materials } = useGLTF(
    "/models/646d9dcdc8a5f5bddbfac913.glb"
  );

  const headRef = useRef();
  const teethRef = useRef();
  const eyeLeftRef = useRef();
  const eyeRightRef = useRef();
  const group = useRef();

  const mouthIndexRef = useRef(null);
  const teethMouthIndexRef = useRef(null);
  const eyeClosedLeftIndexRef = useRef(null);
  const eyeClosedRightIndexRef = useRef(null);
  const eyeLookUpLeftIndexRef = useRef(null);
  const eyeLookUpRightIndexRef = useRef(null);
  const eyeLookDownLeftIndexRef = useRef(null);
  const eyeLookDownRightIndexRef = useRef(null);

  const mouthOpenRef = useRef(0);
  const visemeValueRef = useRef(0);
  const visemeNameRef = useRef("aa");
  const lastVisemeAtRef = useRef(0);
  const visemeHoldMsRef = useRef(120);
  const visemeAttackRef = useRef(0.52);
  const visemeReleaseRef = useRef(0.34);
  const visemeBlendRef = useRef(0.88);
  const headVisemeIndexRef = useRef(null);
  const teethVisemeIndexRef = useRef(null);
  const prevHeadAppliedIndexRef = useRef(undefined);
  const prevTeethAppliedIndexRef = useRef(undefined);
  const speakingEnergyRef = useRef(0);
  const blinkValueRef = useRef(0);
  const blinkTargetRef = useRef(0);
  const nextBlinkAtRef = useRef(0);

  const { animations: idleAnimation } = useFBX("/animations/Idle.fbx");
  const { animations: angryAnimation } = useFBX("/animations/Angry Gesture.fbx");
  const { animations: greetingAnimation } = useFBX(
    "/animations/Standing Greeting.fbx"
  );

  idleAnimation[0].name = "Idle";
  angryAnimation[0].name = "Angry";
  greetingAnimation[0].name = "Greeting";

  const { actions } = useAnimations(
    [idleAnimation[0], angryAnimation[0], greetingAnimation[0]],
    group
  );

  useEffect(() => {
    if (!actions?.Idle) return;
    actions.Idle.reset().fadeIn(0.5).play();

    if (actions.Greeting) {
      actions.Greeting
        .reset()
        .setLoop(THREE.LoopRepeat, Infinity)
        .fadeIn(0.25)
        .setEffectiveWeight(0)
        .play();
    }

    return () => {
      actions.Idle.fadeOut(0.5);
      if (actions.Greeting) {
        actions.Greeting.fadeOut(0.25);
      }
    };
  }, [actions]);

  useEffect(() => {
    if (!visemePacket) return;
    visemeNameRef.current = String(visemePacket.name ?? "aa");
    visemeValueRef.current = THREE.MathUtils.clamp(
      Number(visemePacket.value ?? 0),
      0,
      1
    );
    visemeAttackRef.current = THREE.MathUtils.clamp(
      Number(visemePacket.attack ?? 0.52),
      0.05,
      0.95
    );
    visemeReleaseRef.current = THREE.MathUtils.clamp(
      Number(visemePacket.release ?? 0.34),
      0.05,
      0.95
    );
    visemeBlendRef.current = THREE.MathUtils.clamp(
      Number(visemePacket.blend ?? 0.88),
      0,
      1
    );
    visemeHoldMsRef.current = THREE.MathUtils.clamp(
      Number(visemePacket.holdMs ?? 120),
      50,
      380
    );
    lastVisemeAtRef.current = Date.now();
    // Re-resolve on next frame if backend switches viseme names.
    headVisemeIndexRef.current = null;
    teethVisemeIndexRef.current = null;
  }, [visemePacket]);

  const volume = useAudioAnalyser(audioStream);

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
  const eyeLeftInfluences = useMemo(
    () =>
      nodes.EyeLeft?.morphTargetInfluences
        ? [...nodes.EyeLeft.morphTargetInfluences]
        : [],
    [nodes.EyeLeft]
  );
  const eyeRightInfluences = useMemo(
    () =>
      nodes.EyeRight?.morphTargetInfluences
        ? [...nodes.EyeRight.morphTargetInfluences]
        : [],
    [nodes.EyeRight]
  );

  useFrame((state) => {
    const headMesh = headRef.current;
    const teethMesh = teethRef.current;
    const leftEyeMesh = eyeLeftRef.current;
    const rightEyeMesh = eyeRightRef.current;
    if (!headMesh) return;

    // Resolve indices once.
    if (mouthIndexRef.current === null) {
      const headDict = headMesh.morphTargetDictionary;
      mouthIndexRef.current = getFirstIndex(headDict, MOUTH_NAMES);

      if (teethMesh?.morphTargetDictionary) {
        teethMouthIndexRef.current = getFirstIndex(
          teethMesh.morphTargetDictionary,
          MOUTH_NAMES
        );
      }

      if (leftEyeMesh?.morphTargetDictionary) {
        const leftDict = leftEyeMesh.morphTargetDictionary;
        eyeClosedLeftIndexRef.current = getFirstIndex(leftDict, EYES_CLOSED_NAMES);
        eyeLookUpLeftIndexRef.current = getFirstIndex(leftDict, EYES_LOOK_UP_NAMES);
        eyeLookDownLeftIndexRef.current = getFirstIndex(
          leftDict,
          EYES_LOOK_DOWN_NAMES
        );
      }

      if (rightEyeMesh?.morphTargetDictionary) {
        const rightDict = rightEyeMesh.morphTargetDictionary;
        eyeClosedRightIndexRef.current = getFirstIndex(
          rightDict,
          EYES_CLOSED_NAMES
        );
        eyeLookUpRightIndexRef.current = getFirstIndex(
          rightDict,
          EYES_LOOK_UP_NAMES
        );
        eyeLookDownRightIndexRef.current = getFirstIndex(
          rightDict,
          EYES_LOOK_DOWN_NAMES
        );
      }

      if (mouthIndexRef.current === undefined && headDict) {
        console.log(
          "Lip sync: no matching mouth morph. Head keys:",
          Object.keys(headDict)
        );
      }
    }

    // Resolve dynamic viseme indices lazily (backend can change packet name).
    if (headVisemeIndexRef.current === null) {
      const headDict = headMesh.morphTargetDictionary;
      headVisemeIndexRef.current = getFirstIndex(
        headDict,
        buildVisemeCandidates(visemeNameRef.current)
      );
    }
    if (teethVisemeIndexRef.current === null && teethMesh?.morphTargetDictionary) {
      teethVisemeIndexRef.current = getFirstIndex(
        teethMesh.morphTargetDictionary,
        buildVisemeCandidates(visemeNameRef.current)
      );
    }

    // Blend: use viseme packets while fresh; fall back to RMS when packets pause.
    const visemeTimeoutMs = Math.max(DEFAULT_VISEME_TIMEOUT_MS, visemeHoldMsRef.current);
    const visemeActive = Date.now() - lastVisemeAtRef.current < visemeTimeoutMs;
    if (mouthIndexRef.current !== undefined || headVisemeIndexRef.current !== undefined) {
      const curved = Math.pow(Math.max(volume, 0), 0.6);
      const rmsTarget = THREE.MathUtils.clamp(curved * 1.9, 0, 1);
      const visemeWeighted = THREE.MathUtils.clamp(
        visemeValueRef.current * visemeBlendRef.current +
          rmsTarget * (1 - visemeBlendRef.current),
        0,
        1
      );
      const target = visemeActive ? visemeWeighted : rmsTarget;

      const currentMouth = mouthOpenRef.current;
      const lerpFactor =
        target > currentMouth ? visemeAttackRef.current : visemeReleaseRef.current;
      const smoothed = THREE.MathUtils.lerp(currentMouth, target, lerpFactor);
      mouthOpenRef.current = smoothed;
      speakingEnergyRef.current = smoothed;

      const headTargetIndex = visemeActive
        ? headVisemeIndexRef.current ?? mouthIndexRef.current
        : mouthIndexRef.current;
      const teethTargetIndex = visemeActive
        ? teethVisemeIndexRef.current ?? teethMouthIndexRef.current
        : teethMouthIndexRef.current;

      if (
        prevHeadAppliedIndexRef.current !== undefined &&
        prevHeadAppliedIndexRef.current !== headTargetIndex
      ) {
        headMesh.morphTargetInfluences[prevHeadAppliedIndexRef.current] = 0;
      }
      if (headTargetIndex !== undefined) {
        headMesh.morphTargetInfluences[headTargetIndex] = smoothed;
      }
      prevHeadAppliedIndexRef.current = headTargetIndex;

      if (
        teethMesh &&
        prevTeethAppliedIndexRef.current !== undefined &&
        prevTeethAppliedIndexRef.current !== teethTargetIndex
      ) {
        teethMesh.morphTargetInfluences[prevTeethAppliedIndexRef.current] = 0;
      }
      if (teethMesh && teethTargetIndex !== undefined) {
        teethMesh.morphTargetInfluences[teethTargetIndex] = smoothed * 0.78;
      }
      prevTeethAppliedIndexRef.current = teethTargetIndex;
    }

    // Blink timing.
    const now = state.clock.getElapsedTime();
    if (nextBlinkAtRef.current === 0) {
      nextBlinkAtRef.current = now + THREE.MathUtils.randFloat(1.8, 4.2);
    }
    if (now >= nextBlinkAtRef.current && blinkTargetRef.current === 0) {
      blinkTargetRef.current = 1;
    }

    const blinkLerp = blinkTargetRef.current === 1 ? 0.45 : 0.28;
    blinkValueRef.current = THREE.MathUtils.lerp(
      blinkValueRef.current,
      blinkTargetRef.current,
      blinkLerp
    );

    if (blinkTargetRef.current === 1 && blinkValueRef.current > 0.92) {
      blinkTargetRef.current = 0;
    }
    if (
      blinkTargetRef.current === 0 &&
      blinkValueRef.current < 0.08 &&
      now >= nextBlinkAtRef.current
    ) {
      nextBlinkAtRef.current = now + THREE.MathUtils.randFloat(1.8, 4.2);
    }

    const lookUp = Math.max(0, Math.sin(now * 0.5)) * 0.12;
    const lookDown = Math.max(0, Math.sin(now * 0.5 + Math.PI)) * 0.12;

    if (leftEyeMesh?.morphTargetInfluences) {
      if (eyeClosedLeftIndexRef.current !== undefined) {
        leftEyeMesh.morphTargetInfluences[eyeClosedLeftIndexRef.current] =
          blinkValueRef.current;
      }
      if (eyeLookUpLeftIndexRef.current !== undefined) {
        leftEyeMesh.morphTargetInfluences[eyeLookUpLeftIndexRef.current] = lookUp;
      }
      if (eyeLookDownLeftIndexRef.current !== undefined) {
        leftEyeMesh.morphTargetInfluences[eyeLookDownLeftIndexRef.current] =
          lookDown;
      }
    }

    if (rightEyeMesh?.morphTargetInfluences) {
      if (eyeClosedRightIndexRef.current !== undefined) {
        rightEyeMesh.morphTargetInfluences[eyeClosedRightIndexRef.current] =
          blinkValueRef.current;
      }
      if (eyeLookUpRightIndexRef.current !== undefined) {
        rightEyeMesh.morphTargetInfluences[eyeLookUpRightIndexRef.current] = lookUp;
      }
      if (eyeLookDownRightIndexRef.current !== undefined) {
        rightEyeMesh.morphTargetInfluences[eyeLookDownRightIndexRef.current] =
          lookDown;
      }
    }

    const headBone = group.current?.getObjectByName("Head");
    if (headBone) {
      headBone.lookAt(state.camera.position);
    }

    // Layer a subtle looping hand gesture while speaking.
    if (actions?.Greeting) {
      const speakingTarget = speakingEnergyRef.current > 0.13 ? 0.42 : 0;
      const currentWeight = actions.Greeting.getEffectiveWeight();
      const nextWeight = THREE.MathUtils.lerp(currentWeight, speakingTarget, 0.12);
      actions.Greeting.setEffectiveWeight(nextWeight);
      actions.Greeting.timeScale = speakingTarget > 0 ? 0.85 + speakingEnergyRef.current * 0.8 : 0.8;
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
        ref={eyeLeftRef}
        name="EyeLeft"
        geometry={nodes.EyeLeft.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeLeft.skeleton}
        morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={eyeLeftInfluences}
      />

      <skinnedMesh
        ref={eyeRightRef}
        name="EyeRight"
        geometry={nodes.EyeRight.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeRight.skeleton}
        morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
        morphTargetInfluences={eyeRightInfluences}
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