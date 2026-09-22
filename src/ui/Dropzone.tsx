/**
 * Ô nhận ảnh. Thay cho `fileDrop` của Toolcraft.
 *
 * Nhận ảnh theo ba đường vì người dùng mong đợi cả ba: bấm để chọn file, kéo
 * thả vào ô, và dán từ clipboard (Ctrl+V). Đường thứ ba hay bị bỏ qua nhưng là
 * cách nhanh nhất khi ảnh vừa được chụp hoặc copy từ web.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  fileName: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
};

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export function Dropzone({ fileName, onFile, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && isImage(file)) onFile(file);
    },
    [onFile],
  );

  // Dán từ clipboard. Gắn ở window vì người dùng bấm Ctrl+V khi focus đang ở bất
  // kỳ đâu, không nhất thiết trong ô này.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.files;
      if (items?.length) accept(items);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  if (fileName) {
    return (
      <div className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface-2 px-2">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3.5 shrink-0 fill-none stroke-text-3 stroke-[1.5]"
        >
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <circle cx="6" cy="6.5" r="1" />
          <path d="M2.5 11l3.5-3 3 2.5 2-1.5 2.5 2" />
        </svg>
        {/* truncate + title: tên file dài không được đẩy nút xoá ra khỏi ô */}
        <span className="flex-1 truncate text-text-2" title={fileName}>
          {fileName}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Bỏ ảnh"
          className="shrink-0 rounded px-1 text-text-3 transition-colors hover:bg-surface-3 hover:text-danger"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files);
        }}
        className={`flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed transition-colors ${
          over
            ? "border-accent bg-accent-soft text-text-1"
            : "border-line-strong bg-surface-2 text-text-3 hover:border-accent/60 hover:text-text-2"
        }`}
      >
        <span>Kéo ảnh vào đây</span>
        <span className="text-[11px] text-text-3">
          hoặc bấm để chọn · Ctrl+V để dán
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => accept(event.target.files)}
      />
    </>
  );
}
