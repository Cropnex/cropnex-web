"use client";

import { ChangeEvent, useRef } from "react";

type Props = {
  file: File | null;
  previewUrl: string;
  onChange: (file: File | null, previewUrl: string) => void;
};

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export default function PhotoUploader({
  file,
  previewUrl,
  onChange,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;

    if (!selected) {
      return;
    }

    if (!selected.type.startsWith("image/")) {
      alert("Select an image file.");
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_PHOTO_BYTES) {
      alert("The photo must be 6 MB or smaller.");
      event.target.value = "";
      return;
    }

    onChange(selected, URL.createObjectURL(selected));
  }

  function removePhoto() {
    onChange(null, "");

    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }

    if (libraryInputRef.current) {
      libraryInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
        >
          Take Photo
        </button>

        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Choose from Library
        </button>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />

      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {previewUrl && (
        <div className="mt-4 max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <img
            src={previewUrl}
            alt="Selected scouting observation"
            className="max-h-80 w-full object-cover"
          />

          <div className="flex items-center justify-between gap-4 p-3">
            <p className="text-sm text-gray-400">
              {file?.name} ·{" "}
              {file
                ? (file.size / 1024 / 1024).toFixed(2)
                : "0"}{" "}
              MB
            </p>

            <button
              type="button"
              onClick={removePhoto}
              className="text-sm text-red-400"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}