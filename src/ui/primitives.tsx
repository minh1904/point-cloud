/**
 * UI kit.
 *
 * Hình thức chép sát Toolcraft (MIT, © 2026 Pixel Point — xem NOTICE.md). Các
 * con số ở đây không phải tôi nghĩ ra mà lấy từ source của nó:
 *
 * - Button mặc định: `h-7` · `px-2` · `text-[13px]` · `leading-[1.125rem]` ·
 *   `rounded-lg`
 * - Nhãn section: `text-2xs` (11px) · `leading-none` · `font-semibold` ·
 *   `uppercase` · màu = foreground 75%
 * - Header section: `h-9` · `px-3`
 * - Khoảng cách giữa các control trong một section: **14px**
 * - Slider: track cao **1px**, thumb **9px vuông** bo `2px`, cả hai màu
 *   `--foreground` (trắng), vùng bấm ẩn 18px
 *
 * Chi tiết cuối là thứ dễ làm sai nhất: trực giác bảo "track 4px, thumb tròn,
 * tô màu accent". Toolcraft làm ngược lại — hairline trắng — và kết quả nhìn
 * tĩnh hơn hẳn khi panel có nhiều slider xếp dọc.
 */

import type { ReactNode } from "react";

const FIELD =
  "h-7 rounded-lg border border-[color:var(--border)] bg-transparent text-[13px] leading-[1.125rem]";
const FIELD_HOVER =
  "hover:border-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]";

/* ── Panel & Section ──────────────────────────────────────────────────── */

export function Panel({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-panel shrink-0 flex-col overflow-y-auto border-r border-[color:var(--border)]">
      {children}
    </aside>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[color:var(--border)] pb-3.5 last:border-b-0">
      <header className="flex h-9 items-center justify-between gap-2 px-3">
        <h2 className="m-0 text-2xs leading-none font-semibold whitespace-nowrap text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] uppercase">
          {title}
        </h2>
      </header>
      {/* 14px là khoảng cách control của Toolcraft (--control-list-gap) */}
      <div className="flex flex-col gap-[14px] px-3">{children}</div>
    </section>
  );
}

function Label({ text, value }: { text: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[13px] leading-[1.125rem] text-[color:var(--muted-foreground)]">
        {text}
      </span>
      {value !== undefined && (
        <span className="font-mono text-2xs text-[color:var(--foreground)] tabular-nums">
          {value}
        </span>
      )}
    </div>
  );
}

/* ── Slider ───────────────────────────────────────────────────────────── */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const ratio = max === min ? 0 : (value - min) / (max - min);

  return (
    <label className="flex flex-col gap-4">
      <Label text={label} value={format ? format(value) : value.toFixed(2)} />
      <div className="relative -mt-2.5 flex h-[18px] items-center">
        {/* Track 1px. Phần đã đi qua tô trắng, phần còn lại là muted 38%. */}
        <div className="pointer-events-none absolute inset-x-0 h-px rounded-full bg-[color:color-mix(in_oklab,var(--muted-foreground)_38%,transparent)]">
          <div
            className="h-full rounded-full bg-[color:var(--foreground)]"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {/* Thumb 9px VUÔNG bo 2px — không phải hình tròn. */}
        <div
          className="pointer-events-none absolute size-[9px] -translate-x-1/2 rounded-[2px] bg-[color:var(--foreground)]"
          style={{ left: `${ratio * 100}%` }}
        />
        {/* input thật nằm đè, trong suốt: giữ nguyên hành vi bàn phím và kéo
            chuột của native mà vẫn tự do tạo hình. */}
        <input
          type="range"
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </label>
  );
}

/* ── Select ───────────────────────────────────────────────────────────── */

export type SelectOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
};

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <Label text={label} />
      <div className="relative">
        <select
          className={`w-full appearance-none ${FIELD} ${FIELD_HOVER} cursor-pointer pr-7 pl-2 transition-colors`}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.hint ? ` · ${option.hint}` : ""}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 10 6"
          className="pointer-events-none absolute top-1/2 right-2.5 w-2.5 -translate-y-1/2 fill-none stroke-[color:var(--muted-foreground)] stroke-[1.5]"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </div>
    </label>
  );
}

/* ── Segmented ────────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <Label text={label} />}
      <div
        role="tablist"
        className="flex gap-0.5 rounded-lg border border-[color:var(--border)] p-0.5"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={`h-6 flex-1 rounded-[0.375rem] text-[13px] leading-[1.125rem] transition-colors ${
                active
                  ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                  : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Button ───────────────────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  loading,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary";
  disabled?: boolean;
  loading?: boolean;
}) {
  const style =
    variant === "primary"
      ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] border-transparent hover:opacity-90"
      : `${FIELD} ${FIELD_HOVER}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`h-7 rounded-lg border px-2 text-[13px] leading-[1.125rem] transition-colors disabled:pointer-events-none disabled:opacity-50 ${style}`}
    >
      {loading ? "…" : children}
    </button>
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

const BADGE_VAR = {
  default: "--badge-default",
  experimental: "--badge-experimental",
  quality: "--badge-quality",
  metric: "--badge-metric",
} as const;

export function Badge({ kind }: { kind: keyof typeof BADGE_VAR }) {
  return (
    <span
      className="rounded-[0.25rem] border px-1.5 py-px text-2xs font-semibold tracking-wide uppercase"
      style={{
        color: `var(${BADGE_VAR[kind]})`,
        borderColor: `color-mix(in oklab, var(${BADGE_VAR[kind]}) 35%, transparent)`,
      }}
    >
      {kind}
    </span>
  );
}

/* ── Progress ─────────────────────────────────────────────────────────── */

export function Progress({
  label,
  ratio,
}: {
  label: string;
  /** undefined = không xác định được tiến độ → thanh trôi vô định. */
  ratio?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        text={label}
        value={ratio === undefined ? "" : `${Math.round(ratio * 100)}%`}
      />
      <div className="h-px overflow-hidden rounded-full bg-[color:color-mix(in_oklab,var(--muted-foreground)_38%,transparent)]">
        {ratio === undefined ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[color:var(--foreground)]" />
        ) : (
          <div
            className="h-full rounded-full bg-[color:var(--foreground)] transition-[width] duration-150"
            style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Notice ───────────────────────────────────────────────────────────── */

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "error";
  children: ReactNode;
}) {
  const color = {
    info: "var(--muted-foreground)",
    warn: "var(--attention)",
    error: "var(--destructive)",
  }[tone];

  return (
    <p
      className="m-0 rounded-md border px-2 py-1.5 text-2xs"
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      {children}
    </p>
  );
}
