/**
 * UI kit: các primitive thay thế control của Toolcraft.
 *
 * Vì sao gom vào một file thay vì một file mỗi component: chúng dùng chung một
 * ngôn ngữ thị giác (cùng chiều cao 28px, cùng bán kính, cùng trạng thái hover),
 * và giữ cạnh nhau làm việc lệch nhau khó xảy ra hơn. Khi file vượt ~400 dòng
 * thì tách theo nhóm, không tách theo component.
 *
 * Ba luật lấy từ design system của Toolcraft (`core/layout.md`,
 * `core/control-selection.md`) vì chúng đúng và đã được kiểm nghiệm:
 *
 * 1. Control cao 28px, đồng nhất. Cao thấp khác nhau làm panel nhìn lộn xộn.
 * 2. Nhãn ở trên, giá trị hiện bên phải nhãn — không phải tooltip. Người dùng
 *    cần thấy số hiện tại mà không phải trỏ chuột vào.
 * 3. Nhãn nút là động từ, nhãn control là ngữ cảnh. Không trùng nhau.
 */

import type { ReactNode } from "react";

const CONTROL = "h-7 rounded-md border border-line bg-surface-2 text-text-1";
const HOVER = "hover:border-line-strong hover:bg-surface-3";

/* ── Panel & Section ──────────────────────────────────────────────────── */

export function Panel({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-panel shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-1">
      {children}
    </aside>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-line px-3 py-3 last:border-b-0">
      <header className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">
          {title}
        </h2>
        {action}
      </header>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** Nhãn + giá trị hiện tại trên cùng một dòng, giá trị canh phải. */
function Label({ text, value }: { text: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-2">{text}</span>
      {value !== undefined && (
        <span className="font-mono text-[11px] text-text-3 tabular-nums">
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
    <label className="flex flex-col gap-1.5">
      <Label text={label} value={format ? format(value) : value.toFixed(2)} />
      <div className="relative flex h-7 items-center">
        {/* Track vẽ bằng div để tô được phần đã đi qua; input range thật nằm
            trên, trong suốt, để giữ toàn bộ hành vi bàn phím và kéo chuột. */}
        <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full border-2 border-surface-1 bg-text-1"
          style={{ left: `${ratio * 100}%` }}
        />
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
  /** Hậu tố mờ hơn, ví dụ dung lượng model. */
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
    <label className="flex flex-col gap-1.5">
      <Label text={label} />
      <div className="relative">
        <select
          className={`w-full appearance-none ${CONTROL} ${HOVER} cursor-pointer pr-7 pl-2 transition-colors`}
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
          className="pointer-events-none absolute top-1/2 right-2.5 w-2.5 -translate-y-1/2 fill-none stroke-text-3 stroke-[1.5]"
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
    <div className="flex flex-col gap-1.5">
      {label && <Label text={label} />}
      <div
        role="tablist"
        className="flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5"
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
              className={`h-6 flex-1 rounded transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "text-text-2 hover:bg-surface-3"
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
      ? "bg-accent text-white hover:bg-accent/85 border-transparent"
      : `${CONTROL} ${HOVER}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      // Giữ nguyên chiều rộng khi loading để panel không nhảy — nút đổi kích
      // thước lúc bấm là lỗi hay gặp nhất ở trạng thái async.
      className={`h-7 rounded-md border px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
    >
      {loading ? "…" : children}
    </button>
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

const BADGE_COLOR = {
  default: "text-badge-default",
  experimental: "text-badge-experimental",
  quality: "text-badge-quality",
  metric: "text-badge-metric",
} as const;

export function Badge({ kind }: { kind: keyof typeof BADGE_COLOR }) {
  return (
    <span
      className={`rounded border border-current/25 px-1.5 py-px text-[10px] font-medium tracking-wide uppercase ${BADGE_COLOR[kind]}`}
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
  /** undefined = không xác định được tiến độ → hiện thanh trôi vô định. */
  ratio?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        text={label}
        value={ratio === undefined ? "" : `${Math.round(ratio * 100)}%`}
      />
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        {ratio === undefined ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
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
  const style = {
    info: "border-line bg-surface-2 text-text-2",
    warn: "border-badge-experimental/30 bg-badge-experimental/10 text-badge-experimental",
    error: "border-danger/30 bg-danger/10 text-danger",
  }[tone];

  return (
    <p className={`rounded-md border px-2 py-1.5 text-[12px] ${style}`}>
      {children}
    </p>
  );
}
