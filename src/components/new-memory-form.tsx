"use client";

import { useRef, useState, useCallback } from "react";

const MIN_PHOTOS = 3;

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

  const canSubmit = imageFiles.length >= MIN_PHOTOS;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    recognitionRef.current?.stop();
    onSubmit(description.trim(), imageFiles);
    previews.forEach((url) => URL.revokeObjectURL(url));
  }, [canSubmit, description, imageFiles, previews, onSubmit]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#2A2520]/80 backdrop-blur-sm">
      <div className="pointer-events-auto w-full max-w-md border border-[#4A4035] bg-[#332E28] p-8">
        {/* Optional text description */}
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
            Describe the scene (optional)
          </label>
          <button
            type="button"
            onClick={toggleVoice}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-full transition-all",
              isListening
                ? "animate-pulse bg-[#C86B3C] text-white"
                : "bg-[#3D3830] text-[#9A8B7A] hover:bg-[#4A4035] hover:text-[#D8C8A8]",
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
            "mb-6 w-full resize-none border-none bg-[#3D3830] px-5 py-4 text-sm leading-relaxed text-[#D8C8A8] placeholder-[#6A5E50] transition-all focus:outline-none focus:ring-1 focus:ring-[#C86B3C]",
            isListening ? "ring-1 ring-[#C86B3C]/50" : "",
          ].join(" ")}
        />
        {voiceError && (
          <p className="-mt-4 mb-4 text-[10px] text-[#C86B3C]">{voiceError}</p>
        )}

        {/* Photo upload — mandatory */}
        <label className="mb-3 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
          Photos of the scene
          <span className="ml-2 normal-case tracking-normal text-[#C86B3C]">
            ({imageFiles.length}/{MIN_PHOTOS})
          </span>
        </label>

        {/* Thumbnail grid */}
        <div className="mb-4 flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden bg-[#3D3830]">
              <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(i)}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center bg-[#2A2520]/70 text-[10px] text-[#D8C8A8] opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-20 w-20 items-center justify-center border border-dashed border-[#4A4035] text-[#6A5E50] transition-colors hover:border-[#C86B3C] hover:text-[#C86B3C]"
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
            className="flex-1 border border-[#4A4035] py-3 text-[10px] uppercase tracking-[0.3em] text-[#9A8B7A] transition-colors hover:border-[#C86B3C]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              "flex-1 py-3 text-[10px] uppercase tracking-[0.3em] transition-all",
              canSubmit
                ? "bg-[#C86B3C] text-white hover:bg-[#A6552D]"
                : "cursor-not-allowed bg-[#E2DCD0] text-[#A89F96]",
            ].join(" ")}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
