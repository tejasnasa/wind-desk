import { useCallback, useEffect, useState } from "react";
import type { Envelope } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`,
        );
    }
    const payload = (await response.json()) as Envelope<T>;
    return payload.data;
}

export const api = {
    meta: () => get<import("./types").Meta>("/api/meta"),
    dataRuns: () => get<import("./types").DataRun[]>("/api/data-runs"),
    decision: (deliveryDate: string, asOf?: string) =>
        get<import("./types").DecisionView>(
            `/api/decision/${deliveryDate}${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
        ),
    accuracySummary: (from?: string, to?: string) =>
        get<import("./types").AccuracySummary>(
            `/api/accuracy/summary${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    accuracySeries: (from?: string, to?: string) =>
        get<import("./types").SeriesRow[]>(
            `/api/accuracy/series${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    byLeadTime: (from?: string, to?: string) =>
        get<import("./types").LeadTimeResponse>(
            `/api/accuracy/by-lead-time${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    byHour: (from?: string, to?: string) =>
        get<import("./types").BucketRow[]>(
            `/api/accuracy/by-hour${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    byWeekday: (from?: string, to?: string) =>
        get<import("./types").BucketRow[]>(
            `/api/accuracy/by-weekday${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    distribution: (from?: string, to?: string) =>
        get<import("./types").DistributionResponse>(
            `/api/accuracy/distribution${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    heatmap: (from?: string, to?: string) =>
        get<import("./types").HeatmapResponse>(
            `/api/accuracy/heatmap${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    baselines: (from?: string, to?: string) =>
        get<import("./types").BaselinesResponse>(
            `/api/accuracy/baselines${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    ribbon: (from?: string, to?: string) =>
        get<import("./types").RibbonRow[]>(
            `/api/accuracy/ribbon${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
        ),
    csvUrl: (from?: string, to?: string) =>
        `${BASE}/api/accuracy/export.csv${from || to ? `?${new URLSearchParams({ ...(from && { date_from: from }), ...(to && { date_to: to }) })}` : ""}`,
};

export interface AsyncState<T> {
    data: T | null;
    error: string | null;
    loading: boolean;
}

/** Small data-fetching hook with loading/error state and manual refresh. */
export function useAsync<T>(
    loader: () => Promise<T>,
    deps: unknown[] = [],
): AsyncState<T> & {
    reload: () => void;
} {
    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        error: null,
        loading: true,
    });
    const [nonce, setNonce] = useState(0);

    const reload = useCallback(() => setNonce((n) => n + 1), []);

    useEffect(() => {
        let active = true;
        setState((s) => ({ ...s, loading: true, error: null }));
        loader()
            .then((data) => {
                if (active) setState({ data, error: null, loading: false });
            })
            .catch((error: unknown) => {
                if (active) {
                    setState({
                        data: null,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        loading: false,
                    });
                }
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce]);

    return { ...state, reload };
}
