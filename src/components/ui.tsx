import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brass text-on-brass hover:bg-brass-deep",
  line: "border border-line bg-ink text-parchment hover:border-brass",
  ghost: "text-parchment hover:bg-panel",
  danger: "border border-line text-coral hover:border-coral",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export const fieldClass =
  "min-h-11 w-full rounded-md border border-line bg-ink px-3 text-base text-parchment outline-none placeholder:text-mute focus:border-brass";

/** Same as fieldClass with extra right padding so the custom select chevron does not overlap text. */
export const selectClass =
  "min-h-11 w-full rounded-md border border-line bg-ink px-3 pr-10 text-base text-parchment outline-none focus:border-brass";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-mute">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg border border-line bg-panel", className)}>{children}</section>;
}

export function Meter({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink"
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brass" style={{ width: `${safe}%` }} />
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-3 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-panel p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-3xl leading-none text-parchment">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-md text-mute hover:bg-ink hover:text-parchment">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-mute">{children}</p>;
}
