"use client";

import { Suspense, useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { Float } from "@react-three/drei";
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
const TOP_RES = 75;

const PLACEHOLDER_PALETTES = [
  { base: "#4A4845", accent: "#6B6862" },
  { base: "#8B7D5B", accent: "#A69567" },
  { base: "#6B7D8B", accent: "#8BA0B0" },
  { base: "#8B6B6B", accent: "#B08888" },
  { base: "#5A5845", accent: "#7A7860" },
  { base: "#5B6B7B", accent: "#7888A0" },
  { base: "#7B6B5B", accent: "#A09080" },
  { base: "#555555", accent: "#787878" },
  { base: "#6B5B4B", accent: "#907060" },
];

const TILE_ELEVATIONS = [
  0.00, 0.04, 0.02,
  0.03, 0.00, 0.05,
  0.01, 0.06, 0.03,
];

// ---------------------------------------------------------------------------
//  GLSL noise (shared)
// ---------------------------------------------------------------------------

const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }
`;

// ---------------------------------------------------------------------------
//  Point-cloud tile shaders
// ---------------------------------------------------------------------------

const pointVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aFaceType;

  uniform float uTime;
  uniform float uHover;
  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;
  uniform vec2 uGridPos;
  uniform float uIsAddButton;
  uniform float uIsEmpty;
  uniform float uTileSize;

  varying vec3 vColor;
  varying float vAlpha;

  ${GLSL_NOISE}

  void main() {
    vec3 pos = position;
    float halfTile = uTileSize * 0.5;

    // UV from local tile position (0..1)
    vec2 uv = pos.xy / uTileSize + 0.5;

    bool isTop = aFaceType > 0.5;

    // --- grid-outer-edge jitter: fuzzy organic border on landmass edges ---
    if (isTop) {
      bool outerL = uGridPos.x < 0.5 && uv.x < 0.1;
      bool outerR = uGridPos.x > 1.5 && uv.x > 0.9;
      bool outerT = uGridPos.y < 0.5 && uv.y > 0.9;
      bool outerB = uGridPos.y > 1.5 && uv.y < 0.1;

      if (outerL || outerR || outerT || outerB) {
        float edgeFactor = 0.0;
        if (outerL) edgeFactor = (0.1 - uv.x) / 0.1;
        if (outerR) edgeFactor = (uv.x - 0.9) / 0.1;
        if (outerT) edgeFactor = (uv.y - 0.9) / 0.1;
        if (outerB) edgeFactor = (0.1 - uv.y) / 0.1;
        edgeFactor = clamp(edgeFactor, 0.0, 1.0);

        float jScale = 0.03 * edgeFactor;
        pos.x += (hash(pos.xy + 100.0) - 0.5) * jScale;
        pos.y += (hash(pos.xy + 200.0) - 0.5) * jScale;
        pos.z += (hash(pos.xy + 300.0) - 0.5) * jScale * 0.4;
      }
    }

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // --- point size: perspective-scaled, hover increases density ---
    float sizeBase = aSize * (2.6 + uHover * 1.4);
    gl_PointSize = sizeBase * (280.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 14.0);

    // --- color ---
    float tex = fbm(uv * 6.0 + uGridPos * 3.0);
    vec3 color = mix(uBaseColor, uAccentColor, tex * 0.45);

    if (isTop) {
      // per-point grain: each particle gets a slightly different shade
      float grain = noise(uv * 200.0 + pos.xy * 80.0 + uTime * 0.04);
      grain += noise(uv * 500.0 - pos.yx * 40.0) * 0.5;
      grain = grain * 0.12 - 0.06;
      color += grain;

      // stain patterns
      float stain = fbm(uv * 3.5 + uGridPos * 7.0 + 42.0);
      color = mix(color, uBaseColor * 0.80, stain * 0.20);

      // speckle — occasional brighter particles
      float spk = step(0.92, hash(pos.xy * 300.0 + uGridPos));
      color = mix(color, uAccentColor * 1.3, spk * 0.25);

      // directional light
      vec3 lightDir = normalize(vec3(0.5, 0.7, 1.0));
      float diff = max(dot(vec3(0.0, 0.0, 1.0), lightDir), 0.0);
      color *= 0.58 + diff * 0.42;

      // edge AO
      float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float ao = smoothstep(0.0, 0.10, edgeDist);
      color *= mix(0.76, 1.0, ao);

      // hover glow
      color += uHover * uAccentColor * 0.20;
      color += uHover * 0.04;

      vAlpha = uIsEmpty > 0.5 ? 0.72 : 0.96;

      // "+" icon: brighter/larger particles in the plus shape
      if (uIsAddButton > 0.5) {
        vec2 c = uv - 0.5;
        float inH = step(abs(c.y), 0.018) * step(abs(c.x), 0.09);
        float inV = step(abs(c.x), 0.018) * step(abs(c.y), 0.09);
        float inPlus = max(inH, inV);
        float pulse = 0.72 + 0.28 * sin(uTime * 1.8);
        color = mix(color, vec3(0.93, 0.89, 0.83) * pulse, inPlus * 0.88);
        gl_PointSize *= mix(1.0, 1.4, inPlus);
      }
    } else {
      // side face: darker, subtle grain
      float sg = noise(uv * 120.0 + pos.z * 30.0) * 0.06 - 0.03;
      color = uBaseColor * 0.42 + sg;
      vAlpha = uIsEmpty > 0.5 ? 0.50 : 0.82;
      gl_PointSize *= 0.8;
    }

    vColor = color;
  }
`;

const pointFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;

    // soft circle with crisp-ish falloff — tight overlap = dense stipple
    float alpha = smoothstep(0.5, 0.30, dist) * vAlpha;
    if (alpha < 0.06) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

// ---------------------------------------------------------------------------
//  Edge-fray shaders (backdrop behind the grid)
// ---------------------------------------------------------------------------

const frayVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frayFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  ${GLSL_NOISE}

  void main() {
    vec2 centered = vUv - 0.5;
    vec2 gridHalf = vec2(0.38, 0.38);
    vec2 d = abs(centered) - gridHalf;
    float rectDist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);

    if (rectDist < -0.01 || rectDist > 0.12) discard;

    float n = fbm(vUv * 20.0 + uTime * 0.01);
    float spatter = noise(vUv * 300.0);
    float threshold = smoothstep(0.0, 0.10, rectDist);
    if (spatter > (1.0 - threshold * 0.9)) discard;

    if (centered.x < -gridHalf.x) {
      float leftExtra = noise(vec2(vUv.y * 15.0, uTime * 0.02));
      if (spatter > (0.3 + leftExtra * 0.3)) discard;
    }

    vec3 dustColor = mix(vec3(0.62, 0.58, 0.52), vec3(0.50, 0.47, 0.42), n);
    float alpha = (1.0 - threshold) * 0.25;
    gl_FragColor = vec4(dustColor, alpha);
  }
`;

// ---------------------------------------------------------------------------
//  Point-cloud geometry generator (called once per tile)
// ---------------------------------------------------------------------------

function generateTilePoints(
  topRes: number,
  tileSize: number,
  tileDepth: number,
  seed: number,
) {
  let s = ((seed * 16807) | 0) >>> 0;
  const rand = () => {
    s = (Math.imul(s, 48271) + 1) >>> 0;
    return (s & 0x7fffffff) / 0x7fffffff;
  };

  const half = tileSize / 2;
  const halfD = tileDepth / 2;

  const sideLayers = 2;
  const sidePointsPerEdge = topRes;
  const topCount = topRes * topRes;
  const sideCount = 4 * sidePointsPerEdge * sideLayers;
  const total = topCount + sideCount;

  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const faceTypes = new Float32Array(total);

  let idx = 0;

  // Top face
  for (let iy = 0; iy < topRes; iy++) {
    for (let ix = 0; ix < topRes; ix++) {
      const u = ix / (topRes - 1);
      const v = iy / (topRes - 1);

      let x = (u - 0.5) * tileSize;
      let y = (v - 0.5) * tileSize;
      let z = halfD;

      // per-tile edge jitter (subtle)
      const edgeDist = Math.min(u, 1 - u, v, 1 - v);
      if (edgeDist < 0.06) {
        const jf = (0.06 - edgeDist) / 0.06;
        x += (rand() - 0.5) * 0.012 * jf;
        y += (rand() - 0.5) * 0.012 * jf;
        z += (rand() - 0.5) * 0.005 * jf;
      }

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      sizes[idx] = 0.72 + rand() * 0.56;
      faceTypes[idx] = 1.0;
      idx++;
    }
  }

  // Side faces — 4 edges × depth layers
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < sidePointsPerEdge; i++) {
      const t = i / (sidePointsPerEdge - 1);
      for (let layer = 0; layer < sideLayers; layer++) {
        const depthT = (layer + 0.5) / sideLayers;
        const z = halfD - depthT * tileDepth;

        let x: number, y: number;
        if (side === 0) { x = (t - 0.5) * tileSize; y = half; }
        else if (side === 1) { x = (t - 0.5) * tileSize; y = -half; }
        else if (side === 2) { x = half; y = (t - 0.5) * tileSize; }
        else { x = -half; y = (t - 0.5) * tileSize; }

        x += (rand() - 0.5) * 0.004;
        y += (rand() - 0.5) * 0.004;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        sizes[idx] = 0.55 + rand() * 0.35;
        faceTypes[idx] = 0.0;
        idx++;
      }
    }
  }

  return { positions, sizes, faceTypes, count: total };
}

// ---------------------------------------------------------------------------
//  PointCloudTile — invisible raycast mesh + visible particle system
// ---------------------------------------------------------------------------

interface TileProps {
  position: [number, number, number];
  baseColor: string;
  accentColor: string;
  isEmpty: boolean;
  isAddButton: boolean;
  gridPos: [number, number];
  depth: number;
  onClick?: () => void;
}

function PointCloudTile({
  position,
  baseColor,
  accentColor,
  isEmpty,
  isAddButton,
  gridPos,
  depth,
  onClick,
}: TileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const hoverVal = useRef(0);

  const pointData = useMemo(
    () => generateTilePoints(TOP_RES, TILE_SIZE, depth, gridPos[0] * 1000 + gridPos[1] * 100 + 42),
    [gridPos, depth],
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uAccentColor: { value: new THREE.Color(accentColor) },
      uHover: { value: 0 },
      uIsEmpty: { value: isEmpty ? 1.0 : 0.0 },
      uIsAddButton: { value: isAddButton ? 1.0 : 0.0 },
      uGridPos: { value: new THREE.Vector2(gridPos[0], gridPos[1]) },
      uTileSize: { value: TILE_SIZE },
    }),
    [baseColor, accentColor, isEmpty, isAddButton, gridPos],
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const target = hovered ? 1 : 0;
    hoverVal.current += (target - hoverVal.current) * 0.08;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uHover.value = hoverVal.current;
    groupRef.current.position.z = position[2] + hoverVal.current * 0.12;
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
    <group ref={groupRef} position={position}>
      {/* Invisible hitbox for raycasting */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, depth]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* Point cloud visual */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pointData.positions, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[pointData.sizes, 1]} />
          <bufferAttribute attach="attributes-aFaceType" args={[pointData.faceTypes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={pointVertexShader}
          fragmentShader={pointFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite
        />
      </points>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Ambient particle dust
// ---------------------------------------------------------------------------

function ParticleDust({ count = 150 }: { count?: number }) {
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
//  Edge fray backdrop
// ---------------------------------------------------------------------------

function EdgeFray() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state) => { uniforms.uTime.value = state.clock.elapsedTime; });

  return (
    <mesh position={[0, 0, -0.06]}>
      <planeGeometry args={[3.8, 3.8]} />
      <shaderMaterial
        vertexShader={frayVertexShader}
        fragmentShader={frayFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
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
    const result: Array<{
      row: number;
      col: number;
      memory: MemoryEntry | null;
      isAddButton: boolean;
    }> = [];

    let memIdx = 0;
    let addPlaced = false;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (memIdx < memories.length) {
          result.push({ row, col, memory: memories[memIdx], isAddButton: false });
          memIdx++;
        } else {
          const isAdd = !addPlaced;
          if (isAdd) addPlaced = true;
          result.push({ row, col, memory: null, isAddButton: isAdd });
        }
      }
    }
    return result;
  }, [memories]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.12) * 0.01;
    groupRef.current.position.y = Math.sin(t * 0.25) * 0.025;
  });

  return (
    <group
      ref={groupRef}
      rotation={[Math.PI / 6, -Math.PI / 4, 0]}
      position={[0.2, -0.1, 0]}
    >
      {slots.map(({ row, col, memory, isAddButton }, i) => {
        const x = (col - 1) * TILE_GAP;
        const y = (1 - row) * TILE_GAP;
        const z = TILE_ELEVATIONS[i];
        const palette = memory
          ? memory.colorProfile
          : PLACEHOLDER_PALETTES[i % PLACEHOLDER_PALETTES.length];
        const isFilled = !!memory;
        const depth = isFilled || isAddButton ? TILE_DEPTH : TILE_DEPTH_EMPTY;

        return (
          <PointCloudTile
            key={`${row}-${col}`}
            position={[x, y, z]}
            baseColor={palette.base}
            accentColor={palette.accent}
            isEmpty={!isFilled}
            isAddButton={isAddButton}
            gridPos={[col, row]}
            depth={depth}
            onClick={
              isAddButton
                ? onNewMemoryClick
                : memory
                ? () => onMemoryClick?.(memory.id)
                : undefined
            }
          />
        );
      })}
      <EdgeFray />
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
        <color attach="background" args={["#F7F5F0"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 8]} intensity={0.5} />
        <directionalLight position={[-3, -1, 5]} intensity={0.15} color="#E8D5C0" />

        <Suspense fallback={null}>
          <Float speed={0.6} rotationIntensity={0.015} floatIntensity={0.1}>
            <GridScene
              memories={memories}
              onNewMemoryClick={handleNewMemory}
              onMemoryClick={onMemoryClick}
            />
          </Float>
        </Suspense>
      </Canvas>

      {/* 2D overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#4A3320] md:text-6xl">Rem</h1>
            <p className="mt-2 text-[9px] tracking-[0.3em] text-[#7A6B63] uppercase">
              Your spatial memory atlas
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] tracking-[0.2em] text-[#B5AD9F] uppercase">
              {memories.length} / 9 memories
            </p>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <p className="text-[8px] tracking-[0.3em] text-[#B5AD9F] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
          <p className="text-[8px] tracking-[0.2em] text-[#B5AD9F] uppercase">
            Click a tile to enter &middot; Click + to create
          </p>
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
