"use client";

import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
    <div className="relative h-full w-full overflow-hidden bg-[#0A0A0A]">
      <Canvas
        shadows
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: true, stencil: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={0.3} />

        <directionalLight
          position={[3, 5, 6]}
          intensity={1.5}
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
          color="#FFFFFF"
        />

        <directionalLight position={[-3, -2, 4]} intensity={0.2} color="#FFFFFF" />
        <directionalLight position={[0, -4, -2]} intensity={0.1} color="#FFFFFF" />

        <Suspense fallback={null}>
          <GridScene
            memories={memories}
            onNewMemoryClick={handleNewMemory}
            onMemoryClick={onMemoryClick}
          />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.8}
          zoomSpeed={0.9}
          panSpeed={0.8}
          minDistance={3}
          maxDistance={6}
          minPolarAngle={0.4}
          maxPolarAngle={Math.PI * 0.55}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
        />

        <EffectComposer>
          <N8AO aoRadius={0.4} intensity={3.5} distanceFalloff={0.3} />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8">
        <div className="flex justify-center pt-8">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-light tracking-widest text-[#666666]">rem</h1>
        </div>
        <div className="flex items-end justify-center">
          <p className="font-[family-name:var(--font-space-mono)] text-[8px] tracking-[0.3em] text-[#444444] uppercase">
            Powered by 3D Gaussian Splatting
          </p>
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
