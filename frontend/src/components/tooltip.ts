/**
 * Recharts v3 types its tooltip formatter narrowly; these helpers keep the
 * call sites readable and type-safe.
 */
export function tooltipFormatter(
    unit: string,
    digits = 0,
    byName?: (name: string, value: number) => string | null,
): (value: unknown, name: unknown) => [string, string] {
    return (value: unknown, name: unknown): [string, string] => {
        const numeric = typeof value === "number" ? value : Number(value ?? 0);
        const key = String(name);
        const custom = byName?.(key, numeric);
        const text =
            custom ?? `${digits ? numeric.toFixed(digits) : Math.round(numeric)} ${unit}`;
        return [text, key];
    };
}

export function countFormatter(
    label: string,
): (value: unknown, name: unknown) => [string, string] {
    return (value: unknown, _name: unknown): [string, string] => [
        String(value),
        label,
    ];
}
