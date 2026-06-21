"use client";

import { Suspense, useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { Float, Edges } from "@react-three/drei";
import {
  EffectComposer,
  N8AO,
} from "@react-three/postprocessing";
import * as THREE from "three";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  title: string;
  colorProfile: {
    base: string;
    accent: string;
  };
}

interface IngestScreenProps {
  memories?: MemoryEntry[];
  onNewMemoryClick?: () => void;
  onMemoryClick?: (id: string) => void;
  onGenerate?: (description: string, imageFile: File | null) => void;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TILE_SIZE = 0.88;
const TILE_GAP = 0.96;
const TILE_DEPTH = 0.06;
const TILE_DEPTH_EMPTY = 0.03;

const PLACEHOLDER_PALETTES = [
  { base: "#3D3A38", accent: "#5A5550" },
  { base: "#9B8A55", accent: "#BBA86A" },
  { base: "#4A6878", accent: "#6A90A8" },
  { base: "#904A4A", accent: "#B86868" },
  { base: "#4A5530", accent: "#6A7848" },
  { base: "#3A5068", accent: "#5878A0" },
  { base: "#8A7058", accent: "#B09878" },
  { base: "#454545", accent: "#686868" },
  { base: "#6A4A35", accent: "#987058" },
];

const GRID_CENTER: [number, number, number] = [0, 0.2, 0];

const TILE_ELEVATIONS = [
  0.0, 0.04, 0.02,
  0.03, 0.0, 0.05,
  0.01, 0.06, 0.03,
];

// ---------------------------------------------------------------------------
//  MemoryTile — solid box with standard material
// ---------------------------------------------------------------------------

interface TileProps {
  position: [number, number, number];
  baseColor: string;
  accentColor: string;
  isEmpty: boolean;
  depth: number;
  onClick?: () => void;
}

function MemoryTile({
  position,
  baseColor,
  accentColor,
  isEmpty,
  depth,
  onClick,
}: TileProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const hoverVal = useRef(0);
  const baseCol = useMemo(() => new THREE.Color(baseColor), [baseColor]);
  const accentCol = useMemo(() => new THREE.Color(accentColor), [accentColor]);
  const lerpCol = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const target = hovered ? 1 : 0;
    hoverVal.current += (target - hoverVal.current) * 0.08;
    meshRef.current.position.z = position[2] + hoverVal.current * 0.12;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    lerpCol.copy(baseCol).lerp(accentCol, hoverVal.current * 0.4);
    mat.color.copy(lerpCol);
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "default";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <boxGeometry args={[TILE_SIZE, TILE_SIZE, depth]} />
      <meshBasicMaterial
        color={baseColor}
        transparent={isEmpty}
        opacity={isEmpty ? 0.7 : 1}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
//  AddTile — outline + "+" using drei <Edges>
// ---------------------------------------------------------------------------

interface AddTileProps {
  position: [number, number, number];
  onClick?: () => void;
}

function AddTile({ position, onClick }: AddTileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const hoverVal = useRef(0);

  useFrame(() => {
    if (!groupRef.current) return;
    const target = hovered ? 1 : 0;
    hoverVal.current += (target - hoverVal.current) * 0.08;
    groupRef.current.position.z = position[2] + hoverVal.current * 0.08;
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "default";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  const edgeColor = hovered ? "#7A7060" : "#9A9080";

  return (
    <group ref={groupRef} position={position}>
      {/* Invisible hitbox */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_DEPTH_EMPTY]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* Wireframe outline via drei Edges */}
      <mesh>
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_DEPTH_EMPTY]} />
        <meshBasicMaterial visible={false} />
        <Edges threshold={15} color={edgeColor} lineWidth={1} />
      </mesh>

      {/* "+" cross lines */}
      <PlusIcon color={edgeColor} />
    </group>
  );
}

function PlusIcon({ color }: { color: string }) {
  const hLen = 0.1;
  const positions = useMemo(() => {
    const p = new Float32Array(12);
    // horizontal bar
    p[0] = -hLen; p[1] = 0; p[2] = TILE_DEPTH_EMPTY / 2 + 0.002;
    p[3] = hLen;  p[4] = 0; p[5] = TILE_DEPTH_EMPTY / 2 + 0.002;
    // vertical bar
    p[6] = 0; p[7] = -hLen; p[8] = TILE_DEPTH_EMPTY / 2 + 0.002;
    p[9] = 0; p[10] = hLen; p[11] = TILE_DEPTH_EMPTY / 2 + 0.002;
    return p;
  }, []);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={1} />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
//  Ambient particle dust
// ---------------------------------------------------------------------------

function ParticleDust({ count = 120 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5 + 0.3;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.006;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.006}
        color="#8B7D5B"
        transparent
        opacity={0.2}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
//  GridScene
// ---------------------------------------------------------------------------

interface GridSceneProps {
  memories: MemoryEntry[];
  onNewMemoryClick?: () => void;
  onMemoryClick?: (id: string) => void;
}

function GridScene({ memories, onNewMemoryClick, onMemoryClick }: GridSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  const slots = useMemo(() => {
    const result: Array<{ row: number; col: number; memory: MemoryEntry | null }> = [];
    let memIdx = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 2 && col === 2) continue;
        if (memIdx < memories.length) {
          result.push({ row, col, memory: memories[memIdx] });
          memIdx++;
        } else {
          result.push({ row, col, memory: null });
        }
      }
    }
    return result;
  }, [memories]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.12) * 0.01;
    groupRef.current.position.y = GRID_CENTER[1] + Math.sin(t * 0.25) * 0.025;
  });

  return (
    <group
      ref={groupRef}
      rotation={[-Math.PI / 5, 0, 0]}
      position={GRID_CENTER}
    >
      {slots.map(({ row, col, memory }, i) => {
        const x = (col - 1) * TILE_GAP;
        const y = (1 - row) * TILE_GAP;
        const z = TILE_ELEVATIONS[i];
        const palette = memory
          ? memory.colorProfile
          : PLACEHOLDER_PALETTES[i % PLACEHOLDER_PALETTES.length];
        const isFilled = !!memory;

        return (
          <MemoryTile
            key={`${row}-${col}`}
            position={[x, y, z]}
            baseColor={palette.base}
            accentColor={palette.accent}
            isEmpty={!isFilled}
            depth={isFilled ? TILE_DEPTH : TILE_DEPTH_EMPTY}
            onClick={memory ? () => onMemoryClick?.(memory.id) : undefined}
          />
        );
      })}

      <AddTile
        position={[(2 - 1) * TILE_GAP, (1 - 2) * TILE_GAP, TILE_ELEVATIONS[8]]}
        onClick={onNewMemoryClick}
      />

      <ParticleDust />
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Main IngestScreen
// ---------------------------------------------------------------------------

export default function IngestScreen({
  memories = [],
  onNewMemoryClick,
  onMemoryClick,
  onGenerate,
}: IngestScreenProps) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");

  const handleNewMemory = useCallback(() => {
    if (onNewMemoryClick) {
      onNewMemoryClick();
    } else if (onGenerate) {
      setShowForm(true);
    }
  }, [onNewMemoryClick, onGenerate]);

  const handleSubmit = useCallback(() => {
    if (!description.trim()) return;
    onGenerate?.(description.trim(), null);
    setDescription("");
    setShowForm(false);
  }, [description, onGenerate]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F7F5F0]">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 6, 8]} intensity={1.0} />
        <directionalLight position={[-3, -1, 5]} intensity={0.3} color="#E8D5C0" />

        <Suspense fallback={null}>
          <Float speed={0.6} rotationIntensity={0.015} floatIntensity={0.1}>
            <GridScene
              memories={memories}
              onNewMemoryClick={handleNewMemory}
              onMemoryClick={onMemoryClick}
            />
          </Float>
        </Suspense>

        <EffectComposer>
          <N8AO
            aoRadius={0.6}
            intensity={2.5}
            distanceFalloff={0.5}
          />
        </EffectComposer>
      </Canvas>

      {/* 2D overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-8">
        <div className="flex items-end justify-between">
          <p className="text-[8px] tracking-[0.3em] text-[#B5AD9F] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
          <h1 className="font-serif text-2xl text-[#4A3320]">rem</h1>
        </div>
      </div>

      {/* Inline form overlay */}
      {showForm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F7F5F0]/80 backdrop-blur-sm">
          <div className="pointer-events-auto w-full max-w-md border border-[#E2DCD0] bg-[#F7F5F0] p-8">
            <label className="mb-4 block text-[10px] tracking-[0.2em] text-[#7A6B63] uppercase">
              Describe the memory
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sun-drenched afternoon in a quiet garden..."
              rows={3}
              className="mb-6 w-full resize-none border-none bg-[#EFECE5] px-5 py-4 text-sm leading-relaxed text-[#4A3320] placeholder-[#B5AD9F] transition-all focus:outline-none focus:ring-1 focus:ring-[#C86B3C]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 border border-[#E2DCD0] py-3 text-[10px] uppercase tracking-[0.3em] text-[#7A6B63] transition-colors hover:border-[#C86B3C]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!description.trim()}
                className={[
                  "flex-1 py-3 text-[10px] uppercase tracking-[0.3em] transition-all",
                  description.trim()
                    ? "bg-[#C86B3C] text-white hover:bg-[#A6552D]"
                    : "cursor-not-allowed bg-[#E2DCD0] text-[#A89F96]",
                ].join(" ")}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
