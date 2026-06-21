"use client";

import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import * as THREE from "three";
import GridScene from "./memory-grid";
import NewMemoryForm from "./new-memory-form";

export type { MemoryEntry } from "./memory-grid";

interface IngestScreenProps {
  memories?: import("./memory-grid").MemoryEntry[];
  onNewMemoryClick?: () => void;
  onMemoryClick?: (id: string) => void;
  onGenerate?: (description: string, imageFiles: File[], videoFile: File | null) => void;
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
    (description: string, imageFiles: File[], videoFile: File | null) => {
      onGenerate?.(description, imageFiles, videoFile);
      setShowForm(false);
    },
    [onGenerate],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F5F2ED]">
      <Canvas
        shadows
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={0.4} />

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

        <directionalLight position={[-3, -2, 4]} intensity={0.3} color="#E8D5C0" />
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
          <N8AO aoRadius={0.4} intensity={3.5} distanceFalloff={0.3} />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-8">
        <div className="flex items-end justify-between">
          <p className="text-[8px] tracking-[0.3em] text-[#6A6258] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
          <h1 className="font-serif text-2xl text-[#6A5D4F]">rem</h1>
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
