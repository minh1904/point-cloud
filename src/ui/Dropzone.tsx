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
      <div className="flex h-7 items-center gap-2 rounded-lg border border-[color:var(--border)] px-2 text-[13px] leading-[1.125rem]">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3.5 shrink-0 fill-none stroke-[color:var(--muted-foreground)] stroke-[1.5]"
        >
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <circle cx="6" cy="6.5" r="1" />
          <path d="M2.5 11l3.5-3 3 2.5 2-1.5 2.5 2" />
        </svg>
        {/* truncate + title: tên file dài không được đẩy nút xoá ra khỏi ô */}
        <span className="flex-1 truncate text-[color:var(--muted-foreground)]" title={fileName}>
          {fileName}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Bỏ ảnh"
          className="shrink-0 rounded-[0.25rem] px-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)] hover:text-[color:var(--destructive)]"
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
        className={`flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[13px] leading-[1.125rem] transition-colors ${
          over
            ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)] text-[color:var(--foreground)]"
            : "border-[color:var(--border)] text-[color:var(--muted-foreground)] hover:border-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)] hover:text-[color:var(--foreground)]"
        }`}
      >
        <span>Kéo ảnh vào đây</span>
        <span className="text-2xs text-[color:color-mix(in_oklab,var(--muted-foreground)_70%,transparent)]">
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
