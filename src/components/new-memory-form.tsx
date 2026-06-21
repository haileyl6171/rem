"use client";

import { useRef, useState, useCallback } from "react";

const MIN_PHOTOS = 3;
type MediaMode = "photos" | "video";

interface NewMemoryFormProps {
  onSubmit: (description: string, imageFiles: File[], videoFile: File | null) => void;
  onCancel: () => void;
}

export default function NewMemoryForm({ onSubmit, onCancel }: NewMemoryFormProps) {
  const [description, setDescription] = useState("");
  const [mediaMode, setMediaMode] = useState<MediaMode>("photos");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
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

  const handleAddVideo = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = Array.from(files).find((f) => f.type.startsWith("video/"));
    if (!file) return;
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  }, [videoPreview]);

  const handleRemoveVideo = useCallback(() => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
  }, [videoPreview]);

  const handleSwitchMode = useCallback((mode: MediaMode) => {
    setMediaMode(mode);
  }, []);

  const handleClose = useCallback(() => {
    recognitionRef.current?.stop();
    previews.forEach((url) => URL.revokeObjectURL(url));
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    onCancel();
  }, [previews, videoPreview, onCancel]);

  const canSubmit = mediaMode === "photos"
    ? imageFiles.length >= MIN_PHOTOS
    : videoFile !== null;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    recognitionRef.current?.stop();
    onSubmit(
      description.trim(),
      mediaMode === "photos" ? imageFiles : [],
      mediaMode === "video" ? videoFile : null,
    );
    previews.forEach((url) => URL.revokeObjectURL(url));
    if (videoPreview) URL.revokeObjectURL(videoPreview);
  }, [canSubmit, description, mediaMode, imageFiles, videoFile, previews, videoPreview, onSubmit]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8 font-[family-name:var(--font-space-grotesk)]">
        {/* Description */}
        <div className="mb-2 flex items-center justify-between">
          <label className="font-[family-name:var(--font-space-mono)] text-[10px] tracking-[0.2em] text-[#666666] uppercase">
            Describe the scene (optional)
          </label>
          <button
            type="button"
            onClick={toggleVoice}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-full transition-all",
              isListening
                ? "animate-pulse bg-white text-black"
                : "bg-[#1A1A1A] text-[#666666] hover:bg-[#2A2A2A] hover:text-[#CCCCCC]",
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
          placeholder={isListening ? "Listening..." : "A quiet afternoon in a garden..."}
          rows={2}
          className={[
            "mb-6 w-full resize-none rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-5 py-4 text-sm leading-relaxed text-[#E0E0E0] placeholder-[#444444] transition-all focus:outline-none focus:ring-1 focus:ring-white/30",
            isListening ? "ring-1 ring-white/40" : "",
          ].join(" ")}
        />
        {voiceError && (
          <p className="font-[family-name:var(--font-space-mono)] -mt-4 mb-4 text-[10px] text-[#888888]">{voiceError}</p>
        )}

        {/* Mode toggle */}
        <div className="mb-4 flex gap-1 rounded-lg bg-[#0A0A0A] p-1">
          {(["photos", "video"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleSwitchMode(mode)}
              className={[
                "font-[family-name:var(--font-space-mono)] flex-1 rounded-md py-2 text-[10px] uppercase tracking-[0.2em] transition-all",
                mediaMode === mode
                  ? "bg-[#1A1A1A] text-white"
                  : "text-[#555555] hover:text-[#999999]",
              ].join(" ")}
            >
              {mode === "photos" ? "Photos" : "Video"}
            </button>
          ))}
        </div>

        {mediaMode === "photos" && (
          <>
            <label className="font-[family-name:var(--font-space-mono)] mb-3 block text-[10px] tracking-[0.2em] text-[#666666] uppercase">
              Photos of the scene
              <span className="ml-2 normal-case tracking-normal text-[#888888]">
                ({imageFiles.length}/{MIN_PHOTOS})
              </span>
            </label>

            <div className="mb-4 flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-lg bg-[#1A1A1A]">
                  <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(i)}
                    className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-[#E0E0E0] opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[#333333] text-[#555555] transition-colors hover:border-[#888888] hover:text-[#CCCCCC]"
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
          </>
        )}

        {mediaMode === "video" && (
          <>
            <label className="font-[family-name:var(--font-space-mono)] mb-3 block text-[10px] tracking-[0.2em] text-[#666666] uppercase">
              Video of the scene
            </label>

            {videoPreview ? (
              <div className="group relative mb-4 overflow-hidden rounded-xl bg-[#1A1A1A]">
                <video
                  src={videoPreview}
                  className="h-40 w-full object-cover"
                  muted
                  playsInline
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => {
                    const v = e.target as HTMLVideoElement;
                    v.pause();
                    v.currentTime = 0;
                  }}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-8 w-8 text-white/50 drop-shadow transition-opacity group-hover:opacity-0"
                  >
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-[#E0E0E0] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ×
                </button>
                <p className="mt-1 truncate text-[10px] text-[#555555]">
                  {videoFile?.name}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="mb-4 flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#333333] text-[#555555] transition-colors hover:border-[#888888] hover:text-[#CCCCCC]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <rect x="2" y="4" width="16" height="16" rx="2" />
                  <path d="M22 7l-4 3v4l4 3V7z" />
                </svg>
                <span className="font-[family-name:var(--font-space-mono)] text-[10px] uppercase tracking-[0.15em]">
                  Select video
                </span>
              </button>
            )}

            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                handleAddVideo(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-[#2A2A2A] py-3 font-[family-name:var(--font-space-mono)] text-[10px] uppercase tracking-[0.3em] text-[#666666] transition-colors hover:border-[#555555] hover:text-[#CCCCCC]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              "flex-1 rounded-xl py-3 font-[family-name:var(--font-space-mono)] text-[10px] uppercase tracking-[0.3em] transition-all",
              canSubmit
                ? "bg-white text-black hover:bg-[#CCCCCC]"
                : "cursor-not-allowed bg-[#1A1A1A] text-[#444444]",
            ].join(" ")}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
