declare module "@mkkellogg/gaussian-splats-3d" {
  interface ViewerOptions {
    rootElement?: HTMLElement;
    cameraUp?: [number, number, number];
    initialCameraPosition?: [number, number, number];
    initialCameraLookAt?: [number, number, number];
    selfRenderMode?: boolean;
    gpuAcceleratedSort?: boolean;
    sharedMemoryForWorkers?: boolean;
    halfPrecisionCovariancesOnGPU?: boolean;
    dynamicScene?: boolean;
    webXRMode?: number;
    renderMode?: number;
    sceneRevealMode?: number;
    antialiased?: boolean;
    focalAdjustment?: number;
    logLevel?: number;
    sphericalHarmonicsDegree?: number;
    enableSIMDInSort?: boolean;
    integerBasedSort?: boolean;
    useBuiltInControls?: boolean;
    dropInMode?: boolean;
    camera?: object;
    threeScene?: object;
    renderer?: object;
  }

  interface SplatSceneOptions {
    progressiveLoad?: boolean;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    showLoadingUI?: boolean;
    onProgress?: (progress: number) => void;
  }

  class Viewer {
    constructor(options?: ViewerOptions);
    addSplatScene(
      path: string,
      options?: SplatSceneOptions
    ): Promise<void>;
    addSplatScenes(
      scenes: Array<{ path: string; splatAlphaRemovalThreshold?: number }>,
      showLoadingUI?: boolean
    ): Promise<void>;
    start(): void;
    stop(): void;
    dispose(): void;
    update(): void;
    render(): void;
  }
}
