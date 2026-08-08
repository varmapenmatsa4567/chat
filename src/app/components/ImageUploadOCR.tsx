"use client";

import { useState, useRef, useEffect } from "react";
import Tesseract from "tesseract.js";

export type AttachedImage = {
  file: File;
  previewUrl: string;
  extractedText: string;
  status: "idle" | "extracting" | "ready" | "error";
  progress: number;
  errorMessage?: string;
};

type Props = {
  attachedImage: AttachedImage | null;
  onImageChange: (image: AttachedImage | null) => void;
  disabled?: boolean;
};

export default function ImageUploadOCR({
  attachedImage,
  onImageChange,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, WebP, etc.)");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const initialAttached: AttachedImage = {
      file,
      previewUrl,
      extractedText: "",
      status: "extracting",
      progress: 0,
    };

    onImageChange(initialAttached);

    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            onImageChange({
              file,
              previewUrl,
              extractedText: "",
              status: "extracting",
              progress: Math.round(m.progress * 100),
            });
          }
        },
      });

      const text = result?.data?.text?.trim() ?? "";
      onImageChange({
        file,
        previewUrl,
        extractedText: text || "(No readable text detected in this image)",
        status: "ready",
        progress: 100,
      });
    } catch (err: any) {
      console.error("OCR Extraction failed", err);
      onImageChange({
        file,
        previewUrl,
        extractedText: "",
        status: "error",
        progress: 0,
        errorMessage: err?.message || "Failed to extract text from image",
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // reset input so same file can be chosen again if removed
    e.target.value = "";
  };

  const handleRemove = () => {
    if (attachedImage?.previewUrl) {
      URL.revokeObjectURL(attachedImage.previewUrl);
    }
    onImageChange(null);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Attach Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach image and extract text (OCR)"
        className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
    </>
  );
}
