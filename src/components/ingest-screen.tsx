"use client";

import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import GridScene from "./memory-grid";
import NewMemoryForm from "./new-memory-form";

export type { MemoryEntry } from "./memory-grid";

interface IngestScreenProps {
  memories?: import("./memory-grid").MemoryEntry[];
  onNewMemoryClick?: () => void;
  onMemoryClick?: (id: string) => void;
  onGenerate?: (description: string, imageFiles: File[]) => void;
}

export default function IngestScreen({
  memories = [],
  onNewMemoryClick,
  onMemoryClick,
  onGenerate,
}: IngestScreenProps) {
  const [showForm, setShowForm] = useState(false);

  const handleNewMemory = useCallback(() => {
    if (onNewMemoryClick) {
      onNewMemoryClick();
    } else if (onGenerate) {
      setShowForm(true);
    }
  }, [onNewMemoryClick, onGenerate]);

  const handleFormSubmit = useCallback(
    (description: string, imageFiles: File[]) => {
      onGenerate?.(description, imageFiles);
      setShowForm(false);
    },
    [onGenerate],
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 30%, #F6F9FC 0%, #E6ECF2 60%, #DDE5EC 100%)",
      }}
    >
      <Canvas
        camera={{ position: [0, 0.2, 4.4], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Light, cool studio lighting */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 6]} intensity={1.4} color="#FFFFFF" />
        <directionalLight position={[-4, 2, 3]} intensity={0.5} color="#CFE0EC" />
        <directionalLight position={[0, -3, 2]} intensity={0.25} color="#BFD2E2" />

        <Suspense fallback={null}>
          <GridScene
            memories={memories}
            onNewMemoryClick={handleNewMemory}
            onMemoryClick={onMemoryClick}
          />
        </Suspense>

        {/* Flat-board orbit: a gentle, clamped rotate/zoom around the tilted
            grid (azimuth + polar bounded so it stays a flat board view and the
            underside is never shown). */}
        <OrbitControls
          target={[0, 0.1, 0]}
          enablePan={false}
          enableZoom
          minDistance={3}
          maxDistance={6}
          minPolarAngle={0.4}
          maxPolarAngle={Math.PI * 0.55}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.8}
          zoomSpeed={0.9}
        />
      </Canvas>

      {/* Header / wordmark overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8">
        <div className="flex items-start justify-between animate-fade-in-down">
          <div>
            <h1 className="font-serif text-3xl text-[#2A323B]">rem</h1>
            <p className="mt-1 text-[10px] tracking-[0.25em] text-[#8A96A2] uppercase">
              walk through your memories
            </p>
          </div>
          <p className="text-[8px] tracking-[0.3em] text-[#8A96A2] uppercase pt-2">
            3D Gaussian Splatting
          </p>
        </div>

        <div className="flex items-end justify-between animate-fade-in-up">
          <p className="text-[10px] tracking-[0.2em] text-[#586571] lowercase">
            drag to look around · scroll to zoom · click a memory to enter
          </p>
          <button
            onClick={handleNewMemory}
            className="glass pointer-events-auto rounded-full px-6 py-3 text-[10px] tracking-[0.25em] uppercase text-[#2A323B] transition-all hover:text-[#3E6E8E]"
          >
            + New memory
          </button>
        </div>
      </div>

      {showForm && (
        <NewMemoryForm
          onSubmit={handleFormSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
