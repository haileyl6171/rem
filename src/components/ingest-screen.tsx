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
//  Haze shaders — warm desert atmosphere behind the grid
// ---------------------------------------------------------------------------

const HAZE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HAZE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
               dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 xn = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(xn) - 0.5;
  vec3 ox = floor(xn + 0.5);
  vec3 a0 = xn - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.05;

  vec3 warmAmber = vec3(0.85, 0.65, 0.40);
  vec3 goldenHaze = vec3(0.92, 0.80, 0.58);
  vec3 deepSand = vec3(0.70, 0.50, 0.30);

  float n1 = snoise(uv * 2.0 + vec2(1.7, t));
  float n2 = snoise(uv * 4.0 + vec2(5.3, t * 1.2));
  float n3 = snoise(uv * 8.0 + vec2(9.1, t * 0.8));

  float fog = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.5 + 0.5;

  float cv = snoise(uv * 3.0 + vec2(2.0, t * 0.4)) * 0.5 + 0.5;
  vec3 color = mix(warmAmber, goldenHaze, cv);
  color = mix(color, deepSand, (1.0 - fog) * 0.3);

  float streak = snoise(vec2(uv.x * 0.8 + uv.y * 1.2, t * 0.25) * 2.5)
                 * 0.5 + 0.5;
  streak = smoothstep(0.5, 0.8, streak);
  color = mix(color, goldenHaze * 1.1, streak * 0.15);

  vec2 c = abs(uv - 0.5);
  float warpX = snoise(vec2(uv.y * 3.0, t * 0.6)) * 0.03;
  float warpY = snoise(vec2(uv.x * 3.0 + 50.0, t * 0.5)) * 0.03;
  float edgeX = smoothstep(0.38, 0.48, c.x + warpX);
  float edgeY = smoothstep(0.38, 0.48, c.y + warpY);
  float radial = (1.0 - edgeX) * (1.0 - edgeY);

  float alpha = smoothstep(0.3, 0.7, fog) * radial * 0.32;

  float grain = snoise(uv * 100.0 + uTime) * 0.012;
  color += grain;

  gl_FragColor = vec4(color, alpha);
}
`;

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
//  Desert haze — warm fog plane behind the grid
// ---------------------------------------------------------------------------

function DesertHaze() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 } }),
    [],
  );

  useFrame((state) => {
    if (!meshRef.current) return;
    (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value =
      state.clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} position={[0, 0.12, -0.05]}>
      <planeGeometry args={[3.8, 3.8]} />
      <shaderMaterial
        vertexShader={HAZE_VERTEX_SHADER}
        fragmentShader={HAZE_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
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

      <DesertHaze />
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
    <div className="relative h-full w-full overflow-hidden bg-[#8B5E3C]">
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
          <p className="text-[8px] tracking-[0.3em] text-[#6A6258] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
          <h1 className="font-serif text-2xl text-[#C8B89A]">rem</h1>
        </div>
      </div>

      {/* Inline form overlay */}
      {showForm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#2A2520]/80 backdrop-blur-sm">
          <div className="pointer-events-auto w-full max-w-md border border-[#4A4035] bg-[#332E28] p-8">
            <label className="mb-4 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
              Describe the memory
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sun-drenched afternoon in a quiet garden..."
              rows={3}
              className="mb-6 w-full resize-none border-none bg-[#3D3830] px-5 py-4 text-sm leading-relaxed text-[#D8C8A8] placeholder-[#6A5E50] transition-all focus:outline-none focus:ring-1 focus:ring-[#C86B3C]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 border border-[#4A4035] py-3 text-[10px] uppercase tracking-[0.3em] text-[#9A8B7A] transition-colors hover:border-[#C86B3C]"
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
