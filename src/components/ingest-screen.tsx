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
    <div className="h-full w-full flex flex-col items-center justify-center px-6">
      {/* Logo / Title */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-extralight tracking-[0.3em] text-neutral-100 lowercase">
          Rem
        </h1>
        <p className="mt-3 text-xs tracking-[0.2em] text-neutral-500 lowercase">
          transform moments into 3d spatial memories
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-8 flex flex-col gap-6">
        {/* Textarea */}
        <div className="flex flex-col gap-2">
          <label className="text-xs tracking-widest text-neutral-500 lowercase">
            describe the memory
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="a sun-drenched afternoon in a quiet garden, shadows falling across stone pavement..."
            rows={5}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-700 resize-none focus:outline-none focus:border-neutral-600 transition-colors leading-relaxed"
          />
        </div>

        {/* Drag-and-drop zone */}
        <div className="flex flex-col gap-2">
          <label className="text-xs tracking-widest text-neutral-500 lowercase">
            attach a photo{" "}
            <span className="text-neutral-700">(optional)</span>
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={[
              "relative flex flex-col items-center justify-center gap-2 h-28 rounded-xl border border-dashed cursor-pointer transition-all",
              isDraggingOver
                ? "border-neutral-500 bg-neutral-800"
                : imageFile
                ? "border-neutral-600 bg-neutral-900"
                : "border-neutral-800 bg-neutral-950 hover:border-neutral-700",
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
                <span className="text-xs text-neutral-400">{imageFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFile(null);
                  }}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors lowercase tracking-widest"
                >
                  remove
                </button>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 text-neutral-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-xs text-neutral-700 tracking-widest lowercase">
                  drop image or click to browse
                </span>
              </>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={[
            "w-full py-3 rounded-xl text-xs tracking-[0.25em] lowercase transition-all",
            canSubmit
              ? "bg-neutral-100 text-neutral-950 hover:bg-white"
              : "bg-neutral-900 text-neutral-700 border border-neutral-800 cursor-not-allowed",
          ].join(" ")}
        >
          generate memory
        </button>
      </div>

      {/* Footer hint */}
      <p className="mt-8 text-xs text-neutral-700 tracking-widest lowercase">
        powered by 3d gaussian splatting
      </p>
    </div>
  );
}
