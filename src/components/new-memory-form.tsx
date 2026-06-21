"use client";

import { useRef, useState, useCallback } from "react";

interface NewMemoryFormProps {
  onSubmit: (description: string, imageFiles: File[]) => void;
  onCancel: () => void;
}

export default function NewMemoryForm({ onSubmit, onCancel }: NewMemoryFormProps) {
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleVoice = useCallback(() => {
    setVoiceError(null);

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceError("Voice input is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setDescription((prev) => (prev ? prev + " " + transcript.trim() : transcript.trim()));
      }
    };

    recognition.onerror = (event: Event & { error?: string }) => {
      setIsListening(false);
      const code = event.error ?? "unknown";
      if (code === "aborted") return;
      if (code === "not-allowed") {
        setVoiceError("Microphone access denied — check browser permissions");
      } else if (code === "no-speech") {
        setVoiceError("No speech detected — try again");
      } else {
        setVoiceError(`Voice error: ${code}`);
      }
    };

    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setVoiceError("Could not start voice input — check microphone permissions");
    }
  }, [isListening]);

  const handleAddPhotos = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImageFiles((prev) => [...prev, ...newFiles]);
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
  }, []);

  const handleRemovePhoto = useCallback((index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClose = useCallback(() => {
    recognitionRef.current?.stop();
    previews.forEach((url) => URL.revokeObjectURL(url));
    onCancel();
  }, [previews, onCancel]);

  // Low-friction for the demo: a description OR at least one photo is enough.
  const canSubmit = description.trim().length > 0 || imageFiles.length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    recognitionRef.current?.stop();
    onSubmit(description.trim(), imageFiles);
    previews.forEach((url) => URL.revokeObjectURL(url));
  }, [canSubmit, description, imageFiles, previews, onSubmit]);

  return (
    <div className="glass-scrim absolute inset-0 z-10 flex items-center justify-center p-6 animate-fade-in">
      <div className="glass-dark pointer-events-auto w-full max-w-md rounded-2xl p-8 animate-scale-in">
        <div className="mb-6">
          <h2 className="font-serif text-2xl text-white/90">New memory</h2>
          <p className="mt-1 text-[11px] tracking-[0.15em] text-white/40 uppercase">
            Describe a moment — we&apos;ll rebuild it in 3D
          </p>
        </div>

        {/* Text description */}
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] tracking-[0.2em] text-white/45 uppercase">
            The scene
          </label>
          <button
            type="button"
            onClick={toggleVoice}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-full transition-all",
              isListening
                ? "animate-pulse bg-[#5B89A6] text-white shadow-[0_0_16px_rgba(91,137,166,0.7)]"
                : "bg-white/10 text-white/55 hover:bg-white/20 hover:text-white",
            ].join(" ")}
            title={isListening ? "Stop recording" : "Voice input"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isListening ? "Listening..." : "A sun-drenched afternoon in a quiet garden..."}
          rows={2}
          className={[
            "mb-6 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed text-white/85 placeholder-white/30 transition-all focus:outline-none focus:ring-1 focus:ring-[#8FB6CE]",
            isListening ? "ring-1 ring-[#8FB6CE]/60" : "",
          ].join(" ")}
        />
        {voiceError && (
          <p className="-mt-4 mb-4 text-[10px] text-[#8FB6CE]">{voiceError}</p>
        )}

        {/* Photo upload — optional */}
        <label className="mb-3 block text-[10px] tracking-[0.2em] text-white/45 uppercase">
          Photos
          <span className="ml-2 normal-case tracking-normal text-white/30">
            optional{imageFiles.length > 0 ? ` · ${imageFiles.length} added` : ""}
          </span>
        </label>

        {/* Thumbnail grid */}
        <div className="mb-6 flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-lg bg-white/5">
              <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(i)}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-white/20 text-white/40 transition-colors hover:border-[#8FB6CE] hover:text-[#8FB6CE]"
          >
            <span className="text-2xl leading-none">+</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleAddPhotos(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-white/15 py-3 text-[10px] uppercase tracking-[0.3em] text-white/55 transition-colors hover:border-white/40 hover:text-white/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              "flex-1 rounded-xl py-3 text-[10px] uppercase tracking-[0.3em] transition-all",
              canSubmit
                ? "bg-[#5B89A6] text-white hover:bg-[#3E6E8E] shadow-[0_0_24px_-4px_rgba(91,137,166,0.7)]"
                : "cursor-not-allowed bg-white/10 text-white/30",
            ].join(" ")}
          >
            Reconstruct
          </button>
        </div>
      </div>
    </div>
  );
}
