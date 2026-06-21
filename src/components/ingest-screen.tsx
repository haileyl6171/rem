"use client";

import {
  useState,
  useCallback,
  useRef,
  DragEvent,
  ChangeEvent,
} from "react";

interface IngestScreenProps {
  onGenerate: (description: string, imageFile: File | null) => void;
}

export default function IngestScreen({ onGenerate }: IngestScreenProps) {
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
    }
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!description.trim() && !imageFile) return;
    onGenerate(description.trim(), imageFile);
  }, [description, imageFile, onGenerate]);

  const canSubmit = description.trim().length > 0 || imageFile !== null;

  return (
    <div className="h-full w-full overflow-y-auto font-sans">
      <div className="min-h-full w-full flex flex-col items-center justify-center px-6 py-12">
        {/* Logo / Title */}
        <div className="mb-10 text-center shrink-0">
          <h1 className="text-6xl md:text-7xl font-serif text-[#4A3320] mb-4">
            Rem
          </h1>
          <p className="text-[9px] md:text-[10px] tracking-[0.3em] text-[#7A6B63] uppercase">
            Transform moments into 3D spatial memories
          </p>
        </div>

        {/* Form Area - Editorial style with thin borders */}
        <div className="w-full max-w-2xl border-t border-[#E2DCD0] pt-8 pb-6 flex flex-col gap-8 shrink-0">
          {/* Textarea */}
          <div className="flex flex-col gap-4">
            <label className="text-[10px] tracking-[0.2em] text-[#7A6B63] uppercase">
              01. Describe the memory
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sun-drenched afternoon in a quiet garden, shadows falling across stone pavement..."
              rows={3}
              className="w-full bg-[#EFECE5] border-none px-5 py-4 text-sm text-[#4A3320] placeholder-[#B5AD9F] resize-none focus:outline-none focus:ring-1 focus:ring-[#C86B3C] transition-all leading-relaxed"
            />
          </div>

          {/* Drag-and-drop zone */}
          <div className="flex flex-col gap-4">
            <label className="text-[10px] tracking-[0.2em] text-[#7A6B63] uppercase flex justify-between">
              <span>02. Attach a photo</span>
              <span className="text-[#B5AD9F]">(Optional)</span>
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                "relative flex flex-col items-center justify-center gap-3 h-28 border border-dashed cursor-pointer transition-all",
                isDraggingOver
                  ? "border-[#C86B3C] bg-[#EFECE5]"
                  : imageFile
                  ? "border-[#C86B3C] bg-[#F7F5F0]"
                  : "border-[#D1C9BC] bg-transparent hover:border-[#C86B3C]",
              ].join(" ")}
            >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
            {imageFile ? (
              <>
                <span className="text-sm font-serif text-[#4A3320]">{imageFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFile(null);
                  }}
                  className="text-[10px] text-[#C86B3C] hover:text-[#A6552D] transition-colors uppercase tracking-[0.2em]"
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-serif text-[#7A6B63] italic">
                  Drop image or click to browse
                </span>
              </>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-[#E2DCD0]">
          <button
            type="button"
            disabled={!canSubmit}
            suppressHydrationWarning
            onClick={handleSubmit}
            className={[
              "w-full py-4 text-[10px] tracking-[0.3em] uppercase transition-all duration-300",
              canSubmit
                ? "bg-[#C86B3C] text-white hover:bg-[#A6552D]"
                : "bg-[#E2DCD0] text-[#A89F96] cursor-not-allowed",
            ].join(" ")}
          >
            Generate Memory
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <p className="mt-8 text-[8px] md:text-[9px] text-[#B5AD9F] tracking-[0.3em] uppercase shrink-0 text-center">
        Powered by 3D Gaussian Splatting
      </p>
      </div>
    </div>
  );
}