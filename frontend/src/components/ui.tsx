import type { ReactNode } from "react";

/* ------------------------------------------------------------------ format */
const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export const fmtMw = (value: number | null | undefined): string =>
    value === null || value === undefined || Number.isNaN(value)
        ? "—"
        : nf1.format(value);

export const fmtMwh = (value: number | null | undefined): string =>
    value === null || value === undefined ? "—" : nf0.format(value);

export const fmtGwh = (value: number | null | undefined, digits = 3): string =>
    value === null || value === undefined ? "—" : value.toFixed(digits);

export const fmtPct = (value: number | null | undefined, digits = 1): string =>
    value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;

export const fmtSigned = (
    value: number | null | undefined,
    digits = 0,
): string => {
    if (value === null || value === undefined || Number.isNaN(value))
        return "—";
    const rounded = Number(value.toFixed(digits));
    return `${rounded > 0 ? "+" : ""}${nf1.format(rounded)}`;
};

export const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

export const fmtDateTime = (iso: string): string =>
    new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    });

/**
 * Colour for a signed forecast error: rust = wind shortfall, pine = surplus.
 * The scale is non-linear so that near-zero errors stay close to neutral and
 * the large misses dominate - otherwise a month with a positive bias washes
 * out as a solid block of colour.
 */
export function errorColor(error: number, maxAbs: number): string {
    if (!Number.isFinite(error) || maxAbs <= 0) return "#d6dce2";
    const t = Math.min(Math.abs(error) / maxAbs, 1);
    const intensity = 0.1 + 0.9 * Math.pow(t, 1.6);
    const neutral = [214, 220, 226];
    const target = error > 0 ? [180, 83, 27] : [63, 98, 18];
    const mix = neutral.map((c, i) =>
        Math.round(c + (target[i] - c) * intensity),
    );
    return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/* ------------------------------------------------------------------ panels */
export function Panel({
    title,
    note,
    actions,
    children,
    flush,
}: {
    title: string;
    note?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    flush?: boolean;
}) {
    return (
        <section className="panel">
            <header className="panel__head">
                <h2 className="panel__title">{title}</h2>
                {actions ? (
                    <div className="panel__note">{actions}</div>
                ) : note ? (
                    <div className="panel__note">{note}</div>
                ) : null}
            </header>
            <div
                className={
                    flush ? "panel__body panel__body--flush" : "panel__body"
                }
            >
                {children}
            </div>
        </section>
    );
}

export function StatTile({
    label,
    value,
    unit,
    foot,
    tone,
}: {
    label: string;
    value: string;
    unit?: string;
    foot?: ReactNode;
    tone?: "sea" | "rust" | "pine";
}) {
    return (
        <div className={`stat${tone ? ` stat--${tone}` : ""}`}>
            <div className="stat__label">{label}</div>
            <div className="stat__value">
                {value}
                {unit ? <span className="stat__unit">{unit}</span> : null}
            </div>
            {foot ? <div className="stat__foot">{foot}</div> : null}
        </div>
    );
}

export function Pill({
    children,
    tone,
}: {
    children: ReactNode;
    tone?: "sea" | "rust" | "pine";
}) {
    return (
        <span className={`pill${tone ? ` pill--${tone}` : ""}`}>
            {children}
        </span>
    );
}

export function Legend({
    items,
}: {
    items: { color: string; label: string }[];
}) {
    return (
        <div className="legend">
            {items.map((item) => (
                <span className="legend__item" key={item.label}>
                    <span
                        className="legend__swatch"
                        style={{ background: item.color }}
                    />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ states */
export function Loading({ label = "Loading" }: { label?: string }) {
    return (
        <div className="panel">
            <div className="loader" />
            <div className="state">{label}…</div>
        </div>
    );
}

export function ErrorState({
    message,
    onRetry,
}: {
    message: string;
    onRetry?: () => void;
}) {
    return (
        <div className="state state--error">
            <div className="state__title">The API could not be reached</div>
            <div className="note">{message}</div>
            {onRetry ? (
                <button
                    className="button"
                    style={{ marginTop: 12 }}
                    onClick={onRetry}
                >
                    Try again
                </button>
            ) : null}
        </div>
    );
}

export function EmptyState({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <div className="state">
            <div className="state__title">{title}</div>
            {children ? <div className="note">{children}</div> : null}
        </div>
    );
}
