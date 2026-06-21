"use client";

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
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
  /** Local .splat previewed on this tile (set by the demo data). */
  splatUrl?: string;
}

// ---------------------------------------------------------------------------
//  Layout — a FLAT board of tiles tilted back toward the camera (their layout),
//  reskinned with OUR frosted-glass tiles + cool palette.
// ---------------------------------------------------------------------------

const TILE_SIZE = 0.88;
const TILE_GAP = 0.96;
const TILE_THICK = 0.04;
const BOARD_TILT = -Math.PI / 5; // lay the grid back so it reads flat
const GRID_CENTER: [number, number, number] = [0, 0.2, 0];

// Subtle per-tile height variation so the flat board still has relief.
const TILE_ELEVATIONS = [0.0, 0.04, 0.02, 0.03, 0.0, 0.05, 0.01, 0.06, 0.03];

// Cool placeholder palettes for empty slots.
const PLACEHOLDER_PALETTES = [
  { base: "#9FB3C4", accent: "#C2D2DE" },
  { base: "#8FA8BC", accent: "#B6CAD8" },
  { base: "#A7B9C8", accent: "#CBD8E2" },
];

// ---- Small-on-top splat preview (their rendering style) -------------------
const PREVIEW_SCALE = 0.07; // the splat renders SMALL, floating above the tile
const PREVIEW_SPIN = 0.01; // rad/frame turntable
// Lay the splat FLAT — parallel to the tilted board, right-side up — then it
// turntables around the board normal. (It inherits the board tilt; we do NOT
// stand it upright.)
const PREVIEW_ROT: [number, number, number] = [-Math.PI / 2, 0, 0];
// Lift the preview straight off the tile face so it floats ABOVE the tile,
// staying parallel to it. LIFT = distance along the tile normal; RAISE = up the
// board (kept 0 so it hovers directly over its own tile).
const PREVIEW_LIFT = 0.34;
const PREVIEW_RAISE = 0.0;

// ---- Spotlight tour --------------------------------------------------------
const TOUR_INTERVAL_MS = 10000; // each memory holds the spotlight for 10s

// ---------------------------------------------------------------------------
//  SplatPreview — a single splat rendered SMALL and FLOATING ABOVE the active
//  tile (not clipped into it), lying PARALLEL to the tilted board and slowly
//  turntabling. One instance per distinct splat; only the active one shows (so
//  only it renders + sorts).
// ---------------------------------------------------------------------------

interface SplatPreviewProps {
  url: string;
  target: [number, number, number];
  visible: boolean;
}

function SplatPreview({ url, target, visible }: SplatPreviewProps) {
  const outerRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [ready, setReady] = useState(false);
  const scaleVal = useRef(0);
  const pos = useRef<[number, number, number]>([...target]);
  const wasVisible = useRef(false);

  useEffect(() => {
    let disposed = false;
    const inner = innerRef.current;

    (async () => {
      const GaussianSplats3D = await import("@mkkellogg/gaussian-splats-3d");
      if (disposed || !inner) return;

      const dropIn = new GaussianSplats3D.DropInViewer({
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
        showLoadingUI: false,
      });
      const asGroup = dropIn as unknown as THREE.Group;
      groupRef.current = asGroup;
      asGroup.traverse((o) => {
        o.raycast = () => {};
      });
      inner.add(asGroup);

      try {
        await dropIn.addSplatScene(url, { showLoadingUI: false, progressiveLoad: true });
        if (disposed) return;
        asGroup.traverse((o) => {
          o.raycast = () => {};
        });
        setReady(true);
      } catch (err) {
        console.warn("[SplatPreview] failed to load:", url, err);
      }
    })();

    return () => {
      disposed = true;
      if (groupRef.current) {
        try {
          inner?.remove(groupRef.current);
          (groupRef.current as unknown as { dispose?: () => void }).dispose?.();
        } catch {
          // ignore teardown errors
        }
        groupRef.current = null;
      }
    };
  }, [url]);

  useFrame(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const show = visible && ready;
    const targetScale = show ? PREVIEW_SCALE : 0;
    scaleVal.current += (targetScale - scaleVal.current) * 0.1;
    outer.scale.setScalar(Math.max(scaleVal.current, 0.0001));
    outer.visible = scaleVal.current > 0.005;

    // Snap into place the moment this splat takes the spotlight, glide after.
    if (show && !wasVisible.current) {
      pos.current = [...target];
    } else {
      pos.current[0] += (target[0] - pos.current[0]) * 0.15;
      pos.current[1] += (target[1] - pos.current[1]) * 0.15;
      pos.current[2] += (target[2] - pos.current[2]) * 0.15;
    }
    wasVisible.current = show;
    outer.position.set(pos.current[0], pos.current[1], pos.current[2]);

    // Turntable around the board normal so it spins flat, parallel to the grid.
    if (spinRef.current && ready) spinRef.current.rotation.z += PREVIEW_SPIN;
  });

  return (
    <group ref={outerRef}>
      <group ref={spinRef}>
        <group ref={innerRef} rotation={PREVIEW_ROT} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  GlassTile — OUR frosted-glass tile, now laid flat on the tilted board.
// ---------------------------------------------------------------------------

interface GlassTileProps {
  position: [number, number, number];
  accent: string;
  filled: boolean;
  index: number;
  active?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onClick?: () => void;
}

function GlassTile({
  position,
  accent,
  filled,
  index,
  active = false,
  onHoverStart,
  onHoverEnd,
  onClick,
}: GlassTileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const frameRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const hover = useRef(0);
  const activeVal = useRef(0);

  const accentColor = useMemo(() => new THREE.Color(accent), [accent]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const start = index * 0.07;
    const eased = 1 - Math.pow(1 - THREE.MathUtils.clamp((t - start) / 0.8, 0, 1), 3);

    const h = hovered ? 1 : 0;
    hover.current += (h - hover.current) * 0.1;
    const a = active ? 1 : 0;
    activeVal.current += (a - activeVal.current) * 0.1;
    const lift = Math.max(hover.current, activeVal.current);

    groupRef.current.scale.setScalar(0.6 + eased * 0.4 + activeVal.current * 0.06);
    groupRef.current.position.z = position[2] + (1 - eased) * -0.6 + lift * 0.1;

    if (frameRef.current) {
      frameRef.current.opacity = eased * (filled ? 0.28 : 0.18) + activeVal.current * 0.14;
      frameRef.current.emissiveIntensity = 0.28 + hover.current * 0.6 + activeVal.current * 1.0;
    }
  });

  const handleOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      onHoverStart?.();
      document.body.style.cursor = "pointer";
    },
    [onHoverStart],
  );

  const handleOut = useCallback(() => {
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

  return (
    <group ref={groupRef} position={position}>
      {/* Clickable + frosted backing panel */}
      <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_THICK]} />
        <meshStandardMaterial
          ref={frameRef}
          color="#FFFFFF"
          emissive={accentColor}
          emissiveIntensity={0.28}
          transparent
          opacity={0.24}
          roughness={0.1}
          metalness={0}
        />
      </mesh>

      {/* Cool emissive border frame — brightest on the active / hovered tile */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_THICK)]} />
        <lineBasicMaterial color={accent} transparent opacity={hovered || active ? 1 : 0.65} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  AddTile — OUR glass "create memory" cell, laid flat on the board.
// ---------------------------------------------------------------------------

function AddTile({
  position,
  index,
  onClick,
}: {
  position: [number, number, number];
  index: number;
  onClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const hover = useRef(0);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const start = index * 0.07;
    const eased = 1 - Math.pow(1 - THREE.MathUtils.clamp((t - start) / 0.8, 0, 1), 3);
    const h = hovered ? 1 : 0;
    hover.current += (h - hover.current) * 0.1;
    groupRef.current.scale.setScalar(0.6 + eased * 0.4);
    groupRef.current.position.z = position[2] + (1 - eased) * -0.6 + hover.current * 0.08;
  });

  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }, []);
  const handleOut = useCallback(() => {
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

  const plusColor = hovered ? "#3E6E8E" : "#5B89A6";

  return (
    <group ref={groupRef} position={position}>
      <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_THICK]} />
        <meshStandardMaterial
          color="#FFFFFF"
          emissive="#5B89A6"
          emissiveIntensity={hovered ? 0.5 : 0.2}
          transparent
          opacity={0.14}
          roughness={0.1}
        />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_THICK)]} />
        <lineBasicMaterial color={plusColor} transparent opacity={0.7} />
      </lineSegments>

      {/* Plus sign */}
      <mesh position={[0, 0, TILE_THICK / 2 + 0.01]}>
        <boxGeometry args={[0.24, 0.03, 0.01]} />
        <meshBasicMaterial color={plusColor} />
      </mesh>
      <mesh position={[0, 0, TILE_THICK / 2 + 0.01]}>
        <boxGeometry args={[0.03, 0.24, 0.01]} />
        <meshBasicMaterial color={plusColor} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  ParticleDust — cool ambient motes.
// ---------------------------------------------------------------------------

// Deterministic pseudo-random in [0,1) — pure, safe to call in render.
function pseudo(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function ParticleDust({ count = 180 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (pseudo(i * 3 + 1) - 0.5) * 6;
      p[i * 3 + 1] = (pseudo(i * 3 + 2) - 0.5) * 5;
      p[i * 3 + 2] = (pseudo(i * 3 + 3) - 0.5) * 2 - 0.5;
    }
    return p;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.007}
        color="#AEC2D2"
        transparent
        opacity={0.4}
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

export default function GridScene({
  memories,
  onNewMemoryClick,
  onMemoryClick,
}: GridSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  // 3x3 board: up to 8 memories; the last cell is always the "+" add tile.
  const slots = useMemo(() => {
    const result: Array<{ memory: MemoryEntry | null; pos: [number, number, number] }> = [];
    let memIdx = 0;
    let i = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = (col - 1) * TILE_GAP;
        const y = (1 - row) * TILE_GAP;
        const z = TILE_ELEVATIONS[i];
        if (row === 2 && col === 2) {
          result.push({ memory: null, pos: [x, y, z] }); // add tile
        } else if (memIdx < memories.length) {
          result.push({ memory: memories[memIdx++], pos: [x, y, z] });
        } else {
          result.push({ memory: null, pos: [x, y, z] });
        }
        i++;
      }
    }
    return result;
  }, [memories]);

  // The tour visits every filled memory tile (that has a splat), in grid order.
  const tourStops = useMemo(
    () =>
      slots
        .map((s, idx) => ({ slot: idx, pos: s.pos, path: s.memory?.splatUrl }))
        .filter(
          (s): s is { slot: number; pos: [number, number, number]; path: string } =>
            !!s.path && s.slot !== 8,
        ),
    [slots],
  );

  const distinctPaths = useMemo(
    () => Array.from(new Set(tourStops.map((s) => s.path))),
    [tourStops],
  );

  // Auto-advance the spotlight; hovering a tile overrides the current stop.
  const [stop, setStop] = useState(0);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  useEffect(() => {
    if (tourStops.length === 0) return;
    const id = setInterval(
      () => setStop((s) => (s + 1) % tourStops.length),
      TOUR_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [tourStops.length]);

  const tourSlot = tourStops.length > 0 ? tourStops[stop % tourStops.length].slot : -1;
  const hoverIsSplat =
    hoverSlot != null && !!slots[hoverSlot]?.memory?.splatUrl && hoverSlot !== 8;
  const activeSlot = hoverIsSplat ? (hoverSlot as number) : tourSlot;
  const activeMemory = activeSlot >= 0 ? slots[activeSlot]?.memory : null;
  const activeUrl = activeMemory?.splatUrl ?? null;
  const activePos = activeSlot >= 0 ? slots[activeSlot].pos : null;

  // Where the small splat floats: lifted off the active tile (above + in front).
  const previewTarget: [number, number, number] = activePos
    ? [activePos[0], activePos[1] + PREVIEW_RAISE, activePos[2] + PREVIEW_LIFT]
    : [0, 0, -1];

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = GRID_CENTER[1] + Math.sin(t * 0.3) * 0.02;
  });

  return (
    <group ref={groupRef} position={GRID_CENTER} rotation={[BOARD_TILT, 0, 0]}>
      {slots.map(({ memory, pos }, i) => {
        if (i === 8) {
          return <AddTile key="add" position={pos} index={i} onClick={onNewMemoryClick} />;
        }
        const palette =
          memory?.colorProfile ??
          PLACEHOLDER_PALETTES[i % PLACEHOLDER_PALETTES.length];
        return (
          <GlassTile
            key={memory?.id ?? `empty-${i}`}
            position={pos}
            accent={palette.accent}
            filled={!!memory}
            index={i}
            active={i === activeSlot}
            onHoverStart={memory?.splatUrl ? () => setHoverSlot(i) : undefined}
            onHoverEnd={memory?.splatUrl ? () => setHoverSlot(null) : undefined}
            onClick={memory ? () => onMemoryClick?.(memory.id) : onNewMemoryClick}
          />
        );
      })}

      {distinctPaths.map((p) => (
        <SplatPreview
          key={p}
          url={p}
          target={previewTarget}
          visible={activeUrl === p}
        />
      ))}

      <ParticleDust />
    </group>
  );
}
