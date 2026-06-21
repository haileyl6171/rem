"use client";

import { Suspense, useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { Float } from "@react-three/drei";
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
  onGenerate?: (description: string, imageFiles: File[]) => void;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TILE_SIZE = 0.88;
const TILE_GAP = 0.96;
const TILE_DEPTH = 0.06;
const TILE_DEPTH_EMPTY = 0.03;

const PLACEHOLDER_PALETTES = [
  { base: "#8B4513", accent: "#A65E2E" },
  { base: "#C87533", accent: "#E09050" },
  { base: "#A0522D", accent: "#BF6F45" },
  { base: "#D4883A", accent: "#E8A060" },
  { base: "#6B3A2A", accent: "#8B5540" },
  { base: "#CC6B3C", accent: "#E08858" },
  { base: "#8E6540", accent: "#B08560" },
  { base: "#5C3D2E", accent: "#7A5845" },
  { base: "#B56A40", accent: "#D08858" },
];

const GRID_CENTER: [number, number, number] = [0, 0.2, 0];

const TILE_ELEVATIONS = [
  0.0, 0.04, 0.02,
  0.03, 0.0, 0.05,
  0.01, 0.06, 0.03,
];

// Deterministic micro-architecture variants per tile slot
const TILE_ARCHETYPES = [
  "stepped",
  "recessed",
  "pillar",
  "stepped",
  "recessed",
  "pillar",
  "recessed",
  "stepped",
  "pillar",
];

// ---------------------------------------------------------------------------
//  Volumetric tile shader — granular splatting surface with inner fog
// ---------------------------------------------------------------------------

const TILE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TILE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform float uTime;
uniform float uHover;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

// hash-based noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2d(p);
    p *= 2.1;
    a *= 0.48;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.3;

  // granular speckle layer — thousands of tiny particles
  float grain = hash(floor(uv * 200.0));
  float grainMask = smoothstep(0.3, 0.7, grain);
  float fineGrain = hash(floor(uv * 500.0 + t * 2.0));

  // fbm for organic volume feel
  float f = fbm(uv * 6.0 + t * 0.15);
  float f2 = fbm(uv * 12.0 - t * 0.1);

  // edge dissolution — dissolve into speckles near tile boundaries
  vec2 edgeDist = min(uv, 1.0 - uv);
  float edgeFactor = smoothstep(0.0, 0.12, min(edgeDist.x, edgeDist.y));
  float dissolve = smoothstep(0.0, 0.08, min(edgeDist.x, edgeDist.y) + (grain - 0.5) * 0.06);

  // color mixing with volumetric variation
  vec3 col = mix(uBaseColor, uAccentColor, f * 0.5 + uHover * 0.3);
  col = mix(col, uAccentColor * 1.2, f2 * 0.15);

  // inner atmospheric glow — brighter center, darker edges
  float innerGlow = smoothstep(0.0, 0.35, min(edgeDist.x, edgeDist.y));
  col += uAccentColor * innerGlow * 0.08 * (1.0 + uHover * 2.0);

  // granular texture overlay
  col *= 0.92 + grainMask * 0.08;
  col += (fineGrain - 0.5) * 0.03;

  // hover: intensify saturation and inner glow
  float sat = 1.0 + uHover * 0.3;
  vec3 gray = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
  col = mix(gray, col, sat);
  col += uAccentColor * uHover * 0.12 * innerGlow;

  // simple directional lighting
  vec3 lightDir = normalize(vec3(0.6, 0.8, 1.0));
  float diff = max(dot(vNormal, lightDir), 0.0);
  float lighting = 0.55 + diff * 0.45;
  col *= lighting;

  // final alpha with edge dissolution
  float alpha = dissolve * (0.92 + grainMask * 0.08);

  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
//  Point-cloud border shader for the AddTile
// ---------------------------------------------------------------------------

const ADD_BORDER_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = 11.0;
}
`;

const ADD_BORDER_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (length(c) > 0.5) discard;
  gl_FragColor = vec4(uColor, 0.85);
}
`;

// ---------------------------------------------------------------------------
//  MemoryTile — volumetric splatting surface + micro-architecture
// ---------------------------------------------------------------------------

interface TileProps {
  position: [number, number, number];
  baseColor: string;
  accentColor: string;
  depth: number;
  archetype: string;
  onClick?: () => void;
}

function MemoryTile({
  position,
  baseColor,
  accentColor,
  depth,
  archetype,
  onClick,
}: TileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const hoverVal = useRef(0);

  const uniforms = useMemo(
    () => ({
      uBaseColor: { value: new THREE.Color(baseColor) },
      uAccentColor: { value: new THREE.Color(accentColor) },
      uTime: { value: 0 },
      uHover: { value: 0 },
    }),
    [baseColor, accentColor],
  );

  useFrame((state) => {
    if (!groupRef.current || !matRef.current) return;
    const target = hovered ? 1 : 0;
    hoverVal.current += (target - hoverVal.current) * 0.08;
    groupRef.current.position.z = position[2] + hoverVal.current * 0.12;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uHover.value = hoverVal.current;
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

  const darkerBase = useMemo(() => {
    const c = new THREE.Color(baseColor);
    c.multiplyScalar(0.65);
    return c;
  }, [baseColor]);

  const lighterAccent = useMemo(() => {
    const c = new THREE.Color(accentColor);
    c.multiplyScalar(1.15);
    return c;
  }, [accentColor]);

  const noRaycast = useCallback((self: THREE.Object3D | null) => {
    if (self) self.raycast = () => {};
  }, []);

  return (
    <group ref={groupRef} position={position}>
      {/* Invisible hitbox — sole raycast target */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, depth + 0.04]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* Main tile body — no raycasting */}
      <mesh castShadow receiveShadow ref={noRaycast as never}>
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, depth]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={TILE_VERTEX_SHADER}
          fragmentShader={TILE_FRAGMENT_SHADER}
          uniforms={uniforms}
          transparent
        />
      </mesh>

      {/* Micro-architectural details — all with raycasting disabled */}
      {archetype === "stepped" && (
        <>
          <mesh position={[0, 0, depth / 2 + 0.003]} castShadow ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.7, TILE_SIZE * 0.7, 0.008]} />
            <meshStandardMaterial
              color={darkerBase}
              roughness={0.9}
              metalness={0.05}
            />
          </mesh>
          <mesh position={[TILE_SIZE * 0.2, -TILE_SIZE * 0.15, depth / 2 + 0.012]} castShadow ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.18, TILE_SIZE * 0.22, 0.015]} />
            <meshStandardMaterial
              color={lighterAccent}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
        </>
      )}
      {archetype === "recessed" && (
        <>
          <mesh position={[0, 0, depth / 2 - 0.004]} ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.6, TILE_SIZE * 0.6, 0.006]} />
            <meshStandardMaterial
              color={darkerBase}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
          <mesh position={[-TILE_SIZE * 0.22, TILE_SIZE * 0.22, depth / 2 + 0.006]} castShadow ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.12, TILE_SIZE * 0.4, 0.01]} />
            <meshStandardMaterial
              color={lighterAccent}
              roughness={0.8}
              metalness={0.08}
            />
          </mesh>
        </>
      )}
      {archetype === "pillar" && (
        <>
          <mesh position={[0, 0, depth / 2 + 0.018]} castShadow ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.15, TILE_SIZE * 0.15, 0.035]} />
            <meshStandardMaterial
              color={lighterAccent}
              roughness={0.75}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[0, 0, depth / 2 + 0.003]} castShadow ref={noRaycast as never}>
            <boxGeometry args={[TILE_SIZE * 0.35, TILE_SIZE * 0.35, 0.006]} />
            <meshStandardMaterial
              color={darkerBase}
              roughness={0.9}
              metalness={0.05}
            />
          </mesh>
        </>
      )}

      {/* Tile surface particles */}
      <TileSurfaceParticles baseColor={baseColor} accentColor={accentColor} depth={depth} />
    </group>
  );
}

// ---------------------------------------------------------------------------
//  TileSurfaceParticles — scattered granular points on tile top face
// ---------------------------------------------------------------------------

function TileSurfaceParticles({
  baseColor,
  accentColor,
  depth,
}: {
  baseColor: string;
  accentColor: string;
  depth: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const count = 300;

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const base = new THREE.Color(baseColor);
    const accent = new THREE.Color(accentColor);
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * TILE_SIZE * 0.95;
      const y = (Math.random() - 0.5) * TILE_SIZE * 0.95;
      const z = depth / 2 + Math.random() * 0.025 + 0.002;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      tmp.copy(base).lerp(accent, Math.random() * 0.6);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    return { positions: pos, colors: col };
  }, [baseColor, accentColor, depth, count]);

  useFrame((state) => {
    if (!ref.current) return;
    const geo = ref.current.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const baseZ = depth / 2 + 0.002;
      const drift = Math.sin(t * 0.5 + i * 0.7) * 0.008 + Math.cos(t * 0.3 + i * 1.3) * 0.005;
      posAttr.setZ(i, baseZ + Math.random() * 0.02 + drift);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.008}
        vertexColors
        transparent
        opacity={0.45}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
//  AddTile — point-cloud flickering dotted border + "+"
// ---------------------------------------------------------------------------

interface AddTileProps {
  position: [number, number, number];
  onClick?: () => void;
}

function AddTile({ position, onClick }: AddTileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const borderMatRef = useRef<THREE.ShaderMaterial>(null);
  const plusMatRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const hoverVal = useRef(0);

  const defaultColor = useMemo(() => new THREE.Color("#9A9080"), []);
  const hoverColor = useMemo(() => new THREE.Color("#7A6850"), []);
  const lerpColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const target = hovered ? 1 : 0;
    hoverVal.current += (target - hoverVal.current) * 0.08;
    groupRef.current.position.z = position[2] + hoverVal.current * 0.08;

    lerpColor.copy(defaultColor).lerp(hoverColor, hoverVal.current);
    const t = state.clock.elapsedTime;

    if (borderMatRef.current) {
      borderMatRef.current.uniforms.uTime.value = t;
      borderMatRef.current.uniforms.uColor.value.copy(lerpColor);
    }
    if (plusMatRef.current) {
      plusMatRef.current.uniforms.uTime.value = t;
      plusMatRef.current.uniforms.uColor.value.copy(lerpColor);
    }
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

  const borderPositions = useMemo(() => {
    const pointsPerEdge = 120;
    const totalPoints = pointsPerEdge * 4;
    const pos = new Float32Array(totalPoints * 3);
    const half = TILE_SIZE / 2;
    const z = TILE_DEPTH_EMPTY / 2 + 0.002;
    let idx = 0;

    for (let i = 0; i < pointsPerEdge; i++) {
      const t = (i / pointsPerEdge) * TILE_SIZE - half;
      pos[idx * 3] = t; pos[idx * 3 + 1] = half; pos[idx * 3 + 2] = z; idx++;
      pos[idx * 3] = t; pos[idx * 3 + 1] = -half; pos[idx * 3 + 2] = z; idx++;
      pos[idx * 3] = -half; pos[idx * 3 + 1] = t; pos[idx * 3 + 2] = z; idx++;
      pos[idx * 3] = half; pos[idx * 3 + 1] = t; pos[idx * 3 + 2] = z; idx++;
    }

    return pos;
  }, []);

  const borderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#9A9080") },
    }),
    [],
  );

  const plusUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#9A9080") },
    }),
    [],
  );

  const plusPositions = useMemo(() => {
    const hLen = 0.12;
    const z = TILE_DEPTH_EMPTY / 2 + 0.002;
    const count = 24;
    const pos = new Float32Array(count * 2 * 3);
    let idx = 0;
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 * hLen - hLen;
      pos[idx * 3] = t; pos[idx * 3 + 1] = 0; pos[idx * 3 + 2] = z; idx++;
    }
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 * hLen - hLen;
      pos[idx * 3] = 0; pos[idx * 3 + 1] = t; pos[idx * 3 + 2] = z; idx++;
    }
    return pos;
  }, []);

  return (
    <group ref={groupRef} position={position}>
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_DEPTH_EMPTY]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[borderPositions, 3]} />
        </bufferGeometry>
        <shaderMaterial
          ref={borderMatRef}
          vertexShader={ADD_BORDER_VERTEX_SHADER}
          fragmentShader={ADD_BORDER_FRAGMENT_SHADER}
          uniforms={borderUniforms}
          transparent
          depthWrite={false}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[plusPositions, 3]} />
        </bufferGeometry>
        <shaderMaterial
          ref={plusMatRef}
          vertexShader={ADD_BORDER_VERTEX_SHADER}
          fragmentShader={ADD_BORDER_FRAGMENT_SHADER}
          uniforms={plusUniforms}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Ambient particle dust
// ---------------------------------------------------------------------------

function ParticleDust({ count = 200 }: { count?: number }) {
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
        opacity={0.25}
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
            depth={isFilled ? TILE_DEPTH : TILE_DEPTH_EMPTY}
            archetype={TILE_ARCHETYPES[i]}
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
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewMemory = useCallback(() => {
    if (onNewMemoryClick) {
      onNewMemoryClick();
    } else if (onGenerate) {
      setShowForm(true);
    }
  }, [onNewMemoryClick, onGenerate]);

  const handlePhotosChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    },
    [],
  );

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    if (photos.length < 3) return;
    onGenerate?.(description.trim(), photos);
    setDescription("");
    setPhotos([]);
    setShowForm(false);
  }, [description, photos, onGenerate]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F5F2ED]">
      <Canvas
        shadows
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={0.4} />

        {/* Dramatic angled sun — casts long crisp shadows */}
        <directionalLight
          position={[3, 5, 6]}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.1}
          shadow-camera-far={20}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
          shadow-bias={-0.001}
          shadow-normalBias={0.02}
          color="#FFF5E8"
        />

        {/* Warm fill from below-left */}
        <directionalLight position={[-3, -2, 4]} intensity={0.3} color="#E8D5C0" />

        {/* Cool rim from behind */}
        <directionalLight position={[0, -4, -2]} intensity={0.15} color="#C0D0E0" />

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
            aoRadius={0.4}
            intensity={3.5}
            distanceFalloff={0.3}
          />
        </EffectComposer>
      </Canvas>

      {/* 2D overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-8">
        <div className="flex items-end justify-between">
          <p className="text-[8px] tracking-[0.3em] text-[#6A6258] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
          <h1 className="font-serif text-2xl text-[#6A5D4F]">rem</h1>
        </div>
      </div>

      {/* Inline form overlay */}
      {showForm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#2A2520]/80 backdrop-blur-sm">
          <div className="pointer-events-auto w-full max-w-md border border-[#4A4035] bg-[#332E28] p-8">
            {/* Photo upload — mandatory, min 3 */}
            <label className="mb-2 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
              Upload photos of the scene
              <span className="ml-1 text-[#C86B3C]">
                ({photos.length}/3 minimum)
              </span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotosChange}
              className="hidden"
            />

            {photos.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {photos.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="group relative h-16 w-16 overflow-hidden border border-[#4A4035]"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute inset-0 flex items-center justify-center bg-[#2A2520]/70 text-[#D8C8A8] opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-6 w-full border border-dashed border-[#4A4035] py-4 text-[10px] uppercase tracking-[0.3em] text-[#9A8B7A] transition-colors hover:border-[#C86B3C] hover:text-[#D8C8A8]"
            >
              + Add photos
            </button>

            {/* Optional description */}
            <label className="mb-2 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
              Describe the memory
              <span className="ml-1 text-[#6A5E50]">(optional)</span>
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
                onClick={() => {
                  setShowForm(false);
                  setPhotos([]);
                  setDescription("");
                }}
                className="flex-1 border border-[#4A4035] py-3 text-[10px] uppercase tracking-[0.3em] text-[#9A8B7A] transition-colors hover:border-[#C86B3C]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={photos.length < 3}
                className={[
                  "flex-1 py-3 text-[10px] uppercase tracking-[0.3em] transition-all",
                  photos.length >= 3
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
