import { useRef, useState, type DragEvent, type ReactNode } from "react";

import { cn } from "./cn";

export interface FileDropProps {
  /** Mirrors the `accept` attribute, e.g. `"image/*"`. */
  accept?: string;
  /** Called with the first file that survives the `accept` filter. */
  onFile: (file: File) => void;
  /** Accessible name, and the prompt shown unless `children` replaces it. */
  label: string;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** `"image/*"` and `".png"` and `"image/png"` all have to mean what they say. */
function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;

  return accept.split(",").some((rule) => {
    const pattern = rule.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith(".")) return file.name.toLowerCase().endsWith(pattern);
    if (pattern.endsWith("/*")) return file.type.startsWith(pattern.slice(0, -1));
    return file.type.toLowerCase() === pattern;
  });
}

/**
 * A drop target that is also a file picker.
 *
 * Built around a real `<input type="file">` inside a `<label>` rather than a
 * div with a click handler: that one choice brings the click-to-browse, the
 * keyboard (Tab then Space), the accessible name and the screen-reader role
 * with it, none of which a div would have. The input is hidden from sight but
 * not from the accessibility tree, and the focus ring is drawn on the label
 * through `focus-within`.
 *
 * Drag events fire for children too, so a boolean would flicker off the moment
 * the pointer crossed the text inside. Counting enters against leaves is the
 * fix — `dragenter` on a child arrives before `dragleave` on the parent.
 */
export function FileDrop({
  accept,
  onFile,
  label,
  children,
  disabled,
  className,
}: FileDropProps) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const stop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const take = (files: FileList | null) => {
    const file = Array.from(files ?? []).find((candidate) =>
      matchesAccept(candidate, accept),
    );
    if (file) onFile(file);
  };

  return (
    <label
      data-slot="file-drop"
      data-dragging={dragging ? "" : undefined}
      onDragEnter={(event) => {
        stop(event);
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => {
        stop(event);
        // Without this the browser opens the file instead of offering a drop.
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        stop(event);
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={(event) => {
        stop(event);
        depth.current = 0;
        setDragging(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg",
        "border border-dashed border-border/25 bg-input/5 px-3 py-4 text-center",
        "text-xs-plus text-muted-foreground transition-colors",
        "hover:border-border/40 hover:bg-input/10 hover:text-foreground",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        dragging && "border-ring bg-input/15 text-foreground",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {/* The label's own text would name the input, but `children` is free to
          replace that text with a thumbnail, so name it here as well. */}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // Let the same file be chosen twice in a row: without this the
          // second pick is not a change, and no event fires at all.
          event.target.value = "";
        }}
      />
      {children ?? label}
    </label>
  );
}
