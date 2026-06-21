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

        {/* Mode toggle */}
        <div className="mb-4 flex">
          {(["photos", "video"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleSwitchMode(mode)}
              className={[
                "flex-1 py-2 text-[10px] uppercase tracking-[0.2em] transition-all",
                mediaMode === mode
                  ? "border-b-2 border-[#C86B3C] text-[#D8C8A8]"
                  : "border-b border-[#4A4035] text-[#6A5E50] hover:text-[#9A8B7A]",
              ].join(" ")}
            >
              {mode === "photos" ? "Photos" : "Video"}
            </button>
          ))}
        </div>

        {mediaMode === "photos" && (
          <>
            <label className="mb-3 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
              Photos of the scene
              <span className="ml-2 normal-case tracking-normal text-[#C86B3C]">
                ({imageFiles.length}/{MIN_PHOTOS})
              </span>
            </label>

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
          </>
        )}

        {mediaMode === "video" && (
          <>
            <label className="mb-3 block text-[10px] tracking-[0.2em] text-[#9A8B7A] uppercase">
              Video of the scene
            </label>

            {videoPreview ? (
              <div className="group relative mb-4 overflow-hidden bg-[#3D3830]">
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
                    className="h-8 w-8 text-[#D8C8A8]/60 drop-shadow transition-opacity group-hover:opacity-0"
                  >
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center bg-[#2A2520]/70 text-xs text-[#D8C8A8] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ×
                </button>
                <p className="mt-1 truncate text-[10px] text-[#6A5E50]">
                  {videoFile?.name}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="mb-4 flex h-40 w-full flex-col items-center justify-center gap-2 border border-dashed border-[#4A4035] text-[#6A5E50] transition-colors hover:border-[#C86B3C] hover:text-[#C86B3C]"
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
                  <rect x="2" y="4" width="16" height="16" rx="0" />
                  <path d="M22 7l-4 3v4l4 3V7z" />
                </svg>
                <span className="text-[10px] uppercase tracking-[0.15em]">
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
