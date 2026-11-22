"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import {
  DISTRICT_CAMERA_POSITION,
  DISTRICT_CAMERA_TARGET,
  DISTRICT_CAMERA_ZOOM,
} from "@/features/retro-office/core/district";
import { toWorld } from "@/features/retro-office/core/geometry";
import {
  approach,
  clampTarget,
  wheelZoom,
  zoomAnchorShift,
  type PanBounds,
} from "@/features/retro-office/core/cameraMath";
import type { RenderAgent } from "@/features/retro-office/core/types";

export type CameraPreset = {
  pos: [number, number, number];
  target: [number, number, number];
  zoom?: number;
};

export const CAMERA_PRESETS = {
  overview: {
    pos: DISTRICT_CAMERA_POSITION,
    target: DISTRICT_CAMERA_TARGET,
    zoom: DISTRICT_CAMERA_ZOOM,
  },
  frontDesk: {
    pos: [-2, 8, 4],
    target: [-3, 0, -2],
    zoom: 70,
  },
  lounge: {
    pos: [7, 7, -5],
    target: [5, 0, -3],
    zoom: 62,
  },
} satisfies Record<string, CameraPreset>;

type OrbitControllerLike = {
  target: THREE.Vector3;
  update: () => void;
};

export function CameraAnimator({
  presetRef,
  orbitRef,
}: {
  presetRef: MutableRefObject<CameraPreset | null>;
  orbitRef: RefObject<OrbitControllerLike | null>;
}) {
  const { camera, invalidate } = useThree();
  // DevLabs: the office Canvas is orthographic, so zoom presets must drive it too.
  const isZoomable = (cam: THREE.Camera) =>
    cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera;
  const activePerspectiveCameraRef = useRef<
    THREE.PerspectiveCamera | THREE.OrthographicCamera | null
  >(isZoomable(camera) ? (camera as THREE.OrthographicCamera) : null);
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (isZoomable(camera)) {
      activePerspectiveCameraRef.current = camera as THREE.OrthographicCamera;
    }
  }, [camera]);

  useFrame(() => {
    const preset = presetRef.current;
    const orbit = orbitRef.current;
    if (!preset || !orbit) return;
    // The Canvas renders on demand; keep frames coming while the glide runs.
    invalidate();
    const activeCamera = activePerspectiveCameraRef.current;

    targetPositionRef.current.set(...preset.pos);
    targetLookAtRef.current.set(...preset.target);
    camera.position.lerp(targetPositionRef.current, 0.06);
    orbit.target.lerp(targetLookAtRef.current, 0.06);

    if (activeCamera && typeof preset.zoom === "number") {
      activeCamera.zoom += (preset.zoom - activeCamera.zoom) * 0.08;
      activeCamera.updateProjectionMatrix();
    }

    orbit.update();
    const zoomSettled =
      !activeCamera ||
      typeof preset.zoom !== "number" ||
      Math.abs(activeCamera.zoom - preset.zoom) < 0.5;

    if (camera.position.distanceTo(targetPositionRef.current) < 0.05 && zoomSettled) {
      presetRef.current = null;
    }
  });

  return null;
}

/** Wheel and trackpad-pinch zoom for the orthographic office camera. The
 *  zoom eases toward its target over a few frames and the floor point under
 *  the cursor stays put, so zooming into a desk never slides it off screen. */
export function SmoothZoomController({
  orbitRef,
  presetRef,
  bounds,
  enabled,
}: {
  orbitRef: RefObject<OrbitControllerLike | null>;
  presetRef: MutableRefObject<CameraPreset | null>;
  bounds: PanBounds;
  enabled: boolean;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const targetZoomRef = useRef<number | null>(null);
  const anchorRef = useRef({ nx: 0, ny: 0 });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const element = gl.domElement;
    const handleWheel = (event: WheelEvent) => {
      if (!enabledRef.current || !(camera instanceof THREE.OrthographicCamera)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      anchorRef.current = {
        nx: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        ny: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
      targetZoomRef.current = wheelZoom(
        targetZoomRef.current ?? camera.zoom,
        event.deltaY,
        event.ctrlKey,
      );
      // A scroll takes over from any preset still gliding.
      presetRef.current = null;
      invalidate();
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [camera, gl, invalidate, presetRef]);

  useFrame((_, delta) => {
    const target = targetZoomRef.current;
    if (target === null || !(camera instanceof THREE.OrthographicCamera)) return;
    let next = approach(camera.zoom, target, 50, delta * 1000);
    if (Math.abs(next - target) < 0.05) {
      next = target;
      targetZoomRef.current = null;
    }
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const [dx, dz] = zoomAnchorShift(
      {
        position: camera.position,
        right: { x: e[0], y: e[1], z: e[2] },
        up: { x: e[4], y: e[5], z: e[6] },
        forward: { x: -e[8], y: -e[9], z: -e[10] },
      },
      anchorRef.current.nx,
      anchorRef.current.ny,
      size.width / 2,
      size.height / 2,
      camera.zoom,
      next,
    );
    camera.zoom = next;
    camera.updateProjectionMatrix();
    const orbit = orbitRef.current;
    if (orbit) {
      const [cx, cz] = clampTarget(orbit.target.x + dx, orbit.target.z + dz, bounds);
      camera.position.x += cx - orbit.target.x;
      camera.position.z += cz - orbit.target.z;
      orbit.target.x = cx;
      orbit.target.z = cz;
      orbit.update();
    }
    invalidate();
  });

  return null;
}

export function FollowCamController({
  followRef,
  agentsRef,
  agentLookupRef,
}: {
  followRef: MutableRefObject<string | null>;
  agentsRef: RefObject<RenderAgent[]>;
  agentLookupRef?: RefObject<Map<string, RenderAgent>>;
}) {
  const { camera, set, size, gl, invalidate } = useThree();
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const originalCameraRef = useRef<THREE.PerspectiveCamera | null>(
    camera instanceof THREE.PerspectiveCamera ? camera : null,
  );
  const wasFollowingRef = useRef(false);
  const lastAgentIdRef = useRef<string | null>(null);
  const thetaRef = useRef(0);
  const phiRef = useRef(Math.PI / 6);
  const radiusRef = useRef(2.0);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const cameraPositionRef = useRef(new THREE.Vector3());
  const lookAtRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      originalCameraRef.current = camera;
    }
  }, [camera]);

  useEffect(() => {
    const element = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (!followRef.current || event.button !== 0) return;
      isDraggingRef.current = true;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastMouseRef.current.x;
      const dy = event.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
      thetaRef.current -= dx * 0.006;
      phiRef.current = Math.max(
        0.05,
        Math.min(Math.PI / 2.2, phiRef.current + dy * 0.006),
      );
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if (!followRef.current) return;
      radiusRef.current = Math.max(
        0.8,
        Math.min(10, radiusRef.current + event.deltaY * 0.005),
      );
    };

    element.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    element.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      element.removeEventListener("wheel", handleWheel);
    };
  }, [gl, followRef]);

  useFrame(() => {
    const agentId = followRef.current;
    const isFollowing = agentId !== null;
    if (isFollowing || wasFollowingRef.current) invalidate();

    if (isFollowing && !wasFollowingRef.current) {
      const agent =
        (agentId ? agentLookupRef?.current?.get(agentId) : undefined) ??
        agentsRef.current?.find((candidate) => candidate.id === agentId);
      if (!agent) return;

      if (!perspectiveCameraRef.current) {
        perspectiveCameraRef.current = new THREE.PerspectiveCamera(
          65,
          size.width / size.height,
          0.1,
          100,
        );
      }

      thetaRef.current = agent.facing + Math.PI;
      lastAgentIdRef.current = agentId;
      set({ camera: perspectiveCameraRef.current });
      wasFollowingRef.current = true;
    }

    if (!isFollowing && wasFollowingRef.current) {
      if (originalCameraRef.current) {
        set({ camera: originalCameraRef.current });
      }
      wasFollowingRef.current = false;
      return;
    }

    if (!isFollowing || !perspectiveCameraRef.current) return;

    const agent =
      (agentId ? agentLookupRef?.current?.get(agentId) : undefined) ??
      agentsRef.current?.find((candidate) => candidate.id === agentId);
    if (!agent) return;

    if (agentId !== lastAgentIdRef.current) {
      thetaRef.current = agent.facing + Math.PI;
      lastAgentIdRef.current = agentId;
    }

    const [wx, , wz] = toWorld(agent.x, agent.y);
    const radius = radiusRef.current;
    const theta = thetaRef.current;
    const phi = phiRef.current;

    cameraPositionRef.current.set(
      wx + radius * Math.sin(phi) * Math.sin(theta),
      0.4 + radius * Math.cos(phi),
      wz + radius * Math.sin(phi) * Math.cos(theta),
    );
    perspectiveCameraRef.current.position.copy(cameraPositionRef.current);

    lookAtRef.current.set(wx, 0.5, wz);
    perspectiveCameraRef.current.lookAt(lookAtRef.current);
    perspectiveCameraRef.current.aspect = size.width / size.height;
    perspectiveCameraRef.current.updateProjectionMatrix();
  });

  return null;
}
