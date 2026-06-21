"use client";

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  title: string;
  splatUrl?: string;
  colorProfile: {
    base: string;
    accent: string;
  };
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TILE_SIZE = 0.88;
const TILE_GAP = 0.96;
const TILE_DEPTH = 0.06;
const TILE_DEPTH_EMPTY = 0.03;

const PLACEHOLDER_PALETTES = [
  { base: "#1A1A1A", accent: "#3A3A3A" },
  { base: "#0F0F0F", accent: "#2E2E2E" },
  { base: "#222222", accent: "#444444" },
  { base: "#181818", accent: "#383838" },
  { base: "#111111", accent: "#333333" },
  { base: "#1E1E1E", accent: "#404040" },
  { base: "#151515", accent: "#353535" },
  { base: "#0D0D0D", accent: "#2A2A2A" },
  { base: "#202020", accent: "#424242" },
];

const GRID_CENTER: [number, number, number] = [0, 0.2, 0];

const TILE_ELEVATIONS = [
  0.0, 0.04, 0.02,
  0.03, 0.0, 0.05,
  0.01, 0.06, 0.03,
];

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
//  Shaders
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

void main() {
  vec2 uv = vUv;
  vec2 edgeDist = min(uv, 1.0 - uv);
  float minEdge = min(edgeDist.x, edgeDist.y);

  float border = 1.0 - smoothstep(0.0, 0.04, minEdge);
  float innerLine = 1.0 - smoothstep(0.0, 0.015, abs(minEdge - 0.06));

  float edgeIntensity = border + innerLine * 0.3;

  vec3 borderColor = vec3(0.85 + uHover * 0.15);
  vec3 fillColor = vec3(0.05 + uHover * 0.08);

  float fillAlpha = 0.15 + uHover * 0.15;

  vec3 col = mix(fillColor, borderColor, edgeIntensity);
  float alpha = mix(fillAlpha, 0.95, edgeIntensity);

  vec3 lightDir = normalize(vec3(0.6, 0.8, 1.0));
  float diff = max(dot(vNormal, lightDir), 0.0);
  col *= 0.7 + diff * 0.3;

  gl_FragColor = vec4(col, alpha);
}
`;

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
//  Splat preview (actual gaussian splat via DropInViewer)
// ---------------------------------------------------------------------------

const PREVIEW_SCALE = 0.06;

interface SplatPreviewProps {
  url: string;
  targetPosition: [number, number, number];
  visible: boolean;
}

function SplatPreview({ url, targetPosition, visible }: SplatPreviewProps) {
  const outerRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const viewerRef = useRef<THREE.Group | null>(null);
  const [ready, setReady] = useState(false);
  const scaleVal = useRef(0);
  const posRef = useRef<[number, number, number]>([...targetPosition]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const GS3D: any = await import("@mkkellogg/gaussian-splats-3d");
      if (disposed || !innerRef.current) return;

      const dropIn = new GS3D.DropInViewer({
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
      });

      viewerRef.current = dropIn;
      dropIn.traverse((obj: THREE.Object3D) => {
        obj.raycast = () => {};
      });
      innerRef.current.add(dropIn);

      try {
        await (dropIn as any).addSplatScene(url, {
          showLoadingUI: false,
          progressiveLoad: true,
        });
        if (!disposed) {
          dropIn.traverse((obj: THREE.Object3D) => {
            obj.raycast = () => {};
            const mesh = obj as THREE.Mesh;
            if (mesh.material) {
              const mat = mesh.material as THREE.Material;
              mat.stencilWrite = true;
              mat.stencilRef = 1;
              mat.stencilFunc = THREE.EqualStencilFunc;
              mat.stencilFail = THREE.KeepStencilOp;
              mat.stencilZFail = THREE.KeepStencilOp;
              mat.stencilZPass = THREE.KeepStencilOp;
            }
          });
          setReady(true);
        }
      } catch (err) {
        console.warn("[SplatPreview] failed to load:", err);
      }
    })();

    return () => {
      disposed = true;
      if (viewerRef.current) {
        try {
          innerRef.current?.remove(viewerRef.current);
          (viewerRef.current as any).viewer?.dispose();
        } catch {}
        viewerRef.current = null;
      }
    };
  }, [url]);

  useFrame(() => {
    if (!outerRef.current) return;

    const target = visible && ready ? PREVIEW_SCALE : 0;
    scaleVal.current += (target - scaleVal.current) * 0.1;
    outerRef.current.scale.setScalar(Math.max(scaleVal.current, 0.0001));
    outerRef.current.visible = scaleVal.current > 0.005;

    posRef.current[0] += (targetPosition[0] - posRef.current[0]) * 0.15;
    posRef.current[1] += (targetPosition[1] - posRef.current[1]) * 0.15;
    posRef.current[2] += (targetPosition[2] - posRef.current[2]) * 0.15;
    outerRef.current.position.set(
      posRef.current[0],
      posRef.current[1],
      posRef.current[2],
    );

    if (spinRef.current && ready) {
      spinRef.current.rotation.z += 0.01;
    }
  });

  return (
    <group ref={outerRef}>
      <group ref={spinRef}>
        <group ref={innerRef} rotation={[Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  MemoryTile
// ---------------------------------------------------------------------------

interface TileProps {
  position: [number, number, number];
  baseColor: string;
  accentColor: string;
  depth: number;
  archetype: string;
  title?: string;
  onHoverStart?: (position: [number, number, number]) => void;
  onHoverEnd?: () => void;
  onClick?: () => void;
}

function MemoryTile({
  position,
  baseColor,
  accentColor,
  depth,
  archetype,
  title,
  onHoverStart,
  onHoverEnd,
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

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      onHoverStart?.(position);
      document.body.style.cursor = "pointer";
    },
    [onHoverStart, position],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    onHoverEnd?.();
    document.body.style.cursor = "default";
  }, [onHoverEnd]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  const darkerBase = useMemo(() => new THREE.Color("#1A1A1A"), []);

  const lighterAccent = useMemo(() => new THREE.Color("#555555"), []);

  const noRaycast = useCallback((self: THREE.Object3D) => {
    self.raycast = () => {};
  }, []);

  return (
    <group ref={groupRef} position={position}>
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, depth + 0.04]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

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

      <TileSurfaceParticles baseColor={baseColor} accentColor={accentColor} depth={depth} />

      {title && (
        <Html
          position={[0, TILE_SIZE / 2 + 0.12, depth / 2 + 0.02]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              opacity: hovered ? 1 : 0,
              transform: hovered
                ? "translateY(0) scale(1)"
                : "translateY(8px) scale(0.85)",
              transition: "opacity 0.25s ease-out, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              background: "#0A0A0A",
              border: "1px solid #444",
              padding: "6px 14px",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "11px",
              color: "#E0E0E0",
              letterSpacing: "0.06em",
              borderRadius: "6px",
            }}
          >
            {title}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
//  TileSurfaceParticles
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
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * TILE_SIZE * 0.95;
      const y = (Math.random() - 0.5) * TILE_SIZE * 0.95;
      const z = depth / 2 + Math.random() * 0.025 + 0.002;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const gray = 0.3 + Math.random() * 0.5;
      col[i * 3] = gray;
      col[i * 3 + 1] = gray;
      col[i * 3 + 2] = gray;
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
//  AddTile
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

  const defaultColor = useMemo(() => new THREE.Color("#666666"), []);
  const hoverColor = useMemo(() => new THREE.Color("#CCCCCC"), []);
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
      uColor: { value: new THREE.Color("#666666") },
    }),
    [],
  );

  const plusUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#666666") },
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
//  ParticleDust
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
        color="#888888"
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
//  GridScene (public)
// ---------------------------------------------------------------------------

interface GridSceneProps {
  memories: MemoryEntry[];
  onNewMemoryClick?: () => void;
  onMemoryClick?: (id: string) => void;
}

export default function GridScene({ memories, onNewMemoryClick, onMemoryClick }: GridSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<{
    position: [number, number, number];
    splatUrl: string;
  } | null>(null);

  const handleTileHoverStart = useCallback(
    (position: [number, number, number], splatUrl: string) => {
      if (!previewMounted) setPreviewMounted(true);
      setHoverTarget({ position, splatUrl });
    },
    [previewMounted],
  );

  const handleTileHoverEnd = useCallback(() => {
    setHoverTarget(null);
  }, []);

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

  const previewSplatUrl = useMemo(
    () => memories.find((m) => m.splatUrl)?.splatUrl ?? null,
    [memories],
  );

  useFrame(() => {
    if (!groupRef.current) return;
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
            title={memory?.title}
            onHoverStart={
              memory?.splatUrl
                ? (pos) => handleTileHoverStart(pos, memory.splatUrl!)
                : undefined
            }
            onHoverEnd={memory?.splatUrl ? handleTileHoverEnd : undefined}
            onClick={memory ? () => onMemoryClick?.(memory.id) : undefined}
          />
        );
      })}

      {hoverTarget && (
        <mesh
          position={[
            hoverTarget.position[0],
            hoverTarget.position[1],
            hoverTarget.position[2] + TILE_DEPTH / 2 + 0.015,
          ]}
          renderOrder={-1}
        >
          <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
          <meshBasicMaterial
            colorWrite={false}
            depthWrite={false}
            depthTest={false}
            stencilWrite={true}
            stencilRef={1}
            stencilFunc={THREE.AlwaysStencilFunc}
            stencilFail={THREE.KeepStencilOp}
            stencilZFail={THREE.KeepStencilOp}
            stencilZPass={THREE.ReplaceStencilOp}
          />
        </mesh>
      )}

      {previewMounted && previewSplatUrl && (
        <SplatPreview
          url={previewSplatUrl}
          targetPosition={
            hoverTarget
              ? [
                  hoverTarget.position[0],
                  hoverTarget.position[1],
                  hoverTarget.position[2] + TILE_DEPTH / 2 + 0.02,
                ]
              : [0, 0, -1]
          }
          visible={!!hoverTarget}
        />
      )}

      <AddTile
        position={[(2 - 1) * TILE_GAP, (1 - 2) * TILE_GAP, TILE_ELEVATIONS[8]]}
        onClick={onNewMemoryClick}
      />

      <ParticleDust />
    </group>
  );
}
