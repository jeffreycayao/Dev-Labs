"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import {
  CANVAS_H,
  CANVAS_W,
  SCALE,
  SNAP_GRID,
} from "@/features/retro-office/core/constants";
import { screenConstantSize } from "@/features/retro-office/core/cameraMath";
import {
  ITEM_FOOTPRINT,
  getItemRotationRadians,
  toWorld,
} from "@/features/retro-office/core/geometry";
import type {
  FurnitureItem,
  RenderAgent,
} from "@/features/retro-office/core/types";

const HEAT_COLS = Math.floor(CANVAS_W / SNAP_GRID);
const HEAT_ROWS = Math.floor(CANVAS_H / SNAP_GRID);

export function HeatmapSystem({
  agentsRef,
  heatmapMode,
  heatGridRef,
}: {
  agentsRef: RefObject<RenderAgent[]>;
  heatmapMode: boolean;
  heatGridRef: MutableRefObject<Uint16Array | null>;
}) {
  const frameRef = useRef(0);
  const cellsRef = useRef<{ x: number; z: number; v: number }[]>([]);
  const fallbackHeatGridRef = useRef<Uint16Array>(
    new Uint16Array(HEAT_COLS * HEAT_ROWS),
  );
  const [cells, setCells] = useState<{ x: number; z: number; v: number }[]>([]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    if (heatGridRef.current == null) {
      heatGridRef.current = fallbackHeatGridRef.current;
    }
  }, [heatGridRef]);

  useFrame(() => {
    frameRef.current += 1;
    const grid = heatGridRef.current ?? fallbackHeatGridRef.current;
    if (heatGridRef.current == null) {
      heatGridRef.current = grid;
    }

    if (frameRef.current % (heatmapMode ? 30 : 45) === 0) {
      for (const agent of agentsRef.current ?? []) {
        const col = Math.floor(agent.x / SNAP_GRID);
        const row = Math.floor(agent.y / SNAP_GRID);
        if (col >= 0 && col < HEAT_COLS && row >= 0 && row < HEAT_ROWS) {
          grid[row * HEAT_COLS + col] = Math.min(
            65535,
            grid[row * HEAT_COLS + col] + 1,
          );
        }
      }
    }

    if (heatmapMode && frameRef.current % 120 === 0) {
      let maxValue = 1;
      for (let index = 0; index < grid.length; index += 1) {
        if (grid[index] > maxValue) maxValue = grid[index];
      }

      const nextCells: { x: number; z: number; v: number }[] = [];
      for (let row = 0; row < HEAT_ROWS; row += 1) {
        for (let col = 0; col < HEAT_COLS; col += 1) {
          const value = grid[row * HEAT_COLS + col];
          if (value === 0) continue;
          const [wx, , wz] = toWorld(
            col * SNAP_GRID + SNAP_GRID / 2,
            row * SNAP_GRID + SNAP_GRID / 2,
          );
          nextCells.push({ x: wx, z: wz, v: value / maxValue });
        }
      }

      setCells(nextCells);
    }

    if (!heatmapMode && cellsRef.current.length > 0) {
      setCells([]);
    }
  });

  if (!heatmapMode) return null;

  return (
    <>
      {cells.map((cell, index) => (
        <mesh
          key={index}
          position={[cell.x, 0.002, cell.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[SNAP_GRID * SCALE * 0.9, SNAP_GRID * SCALE * 0.9]} />
          <meshBasicMaterial
            color={
              cell.v < 0.4 ? "#f59e0b" : cell.v < 0.75 ? "#ef4444" : "#dc2626"
            }
            transparent
            opacity={0.15 + cell.v * 0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

type TrailPoint = { pos: THREE.Vector3; age: number; color: string };

export function TrailSystem({
  agentsRef,
  colorMap,
}: {
  agentsRef: RefObject<RenderAgent[]>;
  colorMap: Map<string, string>;
}) {
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const frameRef = useRef(0);
  const [points, setPoints] = useState<TrailPoint[]>([]);

  useFrame(() => {
    frameRef.current += 1;
    const agents = agentsRef.current ?? [];
    const trails = trailsRef.current;

    if (frameRef.current % 12 === 0) {
      for (const agent of agents) {
        if (agent.state !== "walking") continue;
        const [wx, , wz] = toWorld(agent.x, agent.y);
        const existing = trails.get(agent.id) ?? [];
        existing.unshift({
          pos: new THREE.Vector3(wx, 0.01, wz),
          age: 0,
          color: colorMap.get(agent.id) ?? "#888",
        });
        if (existing.length > 6) existing.splice(6);
        trails.set(agent.id, existing);
      }
    }

    let changed = false;
    for (const [id, trailPoints] of trails) {
      for (const point of trailPoints) {
        point.age += 1;
      }
      for (let index = trailPoints.length - 1; index >= 0; index -= 1) {
        if (trailPoints[index].age < 48) continue;
        trailPoints.splice(index, 1);
        changed = true;
      }
      if (trailPoints.length === 0) {
        trails.delete(id);
        changed = true;
      }
    }

    if (frameRef.current % 8 === 0 || changed) {
      const nextPoints: TrailPoint[] = [];
      for (const trailPoints of trails.values()) nextPoints.push(...trailPoints);
      // Ages fade the points, so a non-empty trail redraws; an empty one stays put.
      setPoints((prev) => (prev.length === 0 && nextPoints.length === 0 ? prev : nextPoints));
    }
  });

  return (
    <>
      {points.map((point, index) => (
        <mesh
          key={index}
          position={[point.pos.x, point.pos.y, point.pos.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.05, 8]} />
          <meshBasicMaterial
            color={point.color}
            transparent
            opacity={Math.max(0, (1 - point.age / 48) * 0.45)}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

const HIGHLIGHT_LIME = "#CDF252";
const HIGHLIGHT_KEY = "#E1642D";

/** Rings on the floor under the hovered and the selected agent, and a pad under
 *  the hovered desk. The rings keep a constant size on screen, so they read the
 *  same from the whole-floor view down to a single desk. */
export function FloorHighlights({
  hoveredAgentId,
  selectedAgentId,
  hoveredDesk,
  agentLookupRef,
}: {
  hoveredAgentId: string | null;
  selectedAgentId: string | null;
  hoveredDesk: FurnitureItem | null;
  agentLookupRef: RefObject<Map<string, RenderAgent>>;
}) {
  const { camera } = useThree();
  const hoverRef = useRef<THREE.Mesh>(null);
  const selectedRef = useRef<THREE.Mesh>(null);
  const deskPad = useMemo(() => {
    if (!hoveredDesk) return null;
    const [w, h] = ITEM_FOOTPRINT[hoveredDesk.type] ?? [60, 47];
    const [wx, , wz] = toWorld(hoveredDesk.x, hoveredDesk.y);
    return {
      position: [wx, 0.012, wz] as [number, number, number],
      rotationY: getItemRotationRadians(hoveredDesk),
      size: [(hoveredDesk.w ?? w) * SCALE + 0.16, (hoveredDesk.h ?? h) * SCALE + 0.16] as [number, number],
    };
  }, [hoveredDesk]);

  useFrame(() => {
    const zoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : 60;
    const place = (mesh: THREE.Mesh | null, agentId: string | null, px: number) => {
      if (!mesh) return;
      const agent = agentId ? agentLookupRef.current?.get(agentId) : undefined;
      mesh.visible = Boolean(agent);
      if (!agent) return;
      const [wx, , wz] = toWorld(agent.x, agent.y);
      mesh.position.set(wx, 0.014, wz);
      mesh.scale.setScalar(screenConstantSize(px, zoom, 0.5));
    };
    place(hoverRef.current, hoveredAgentId, 64);
    place(selectedRef.current, selectedAgentId === hoveredAgentId ? null : selectedAgentId, 72);
  });

  return (
    <>
      <mesh ref={hoverRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1}>
        <ringGeometry args={[0.4, 0.5, 40]} />
        <meshBasicMaterial color={HIGHLIGHT_LIME} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={selectedRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1}>
        <ringGeometry args={[0.42, 0.5, 40]} />
        <meshBasicMaterial color={HIGHLIGHT_KEY} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {deskPad ? (
        <mesh
          position={deskPad.position}
          rotation={[-Math.PI / 2, 0, deskPad.rotationY]}
          renderOrder={1}
        >
          <planeGeometry args={deskPad.size} />
          <meshBasicMaterial color={HIGHLIGHT_LIME} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ) : null}
    </>
  );
}
