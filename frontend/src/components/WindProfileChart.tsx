import { useMemo } from "react";
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { HourPoint } from "../api/types";
import { fmtMw } from "./ui";

const AXIS = {
    stroke: "#c9d2dc",
    fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace",
};

/**
 * The hero chart: the delivery-day wind profile as it stood at gate closure,
 * with the settled outturn and the empirical error band.
 */
export function WindProfileChart({
    points,
    height = 330,
}: {
    points: HourPoint[];
    height?: number;
}) {
    const data = useMemo(
        () =>
            points.map((point) => ({
                hour: point.local_hour,
                forecast: point.forecast_mw,
                actual: point.actual_mw,
                band:
                    point.band_lower_mw !== null && point.band_upper_mw !== null
                        ? [point.band_lower_mw, point.band_upper_mw]
                        : null,
                error: point.error_mw,
            })),
        [points],
    );

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart
                data={data}
                margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            >
                <defs>
                    <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stopColor="#0e6e7d"
                            stopOpacity={0.18}
                        />
                        <stop
                            offset="100%"
                            stopColor="#0e6e7d"
                            stopOpacity={0.05}
                        />
                    </linearGradient>
                </defs>
                <CartesianGrid stroke="#e6ebf0" vertical={false} />
                <XAxis
                    dataKey="hour"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: "#c9d2dc" }}
                    interval={2}
                />
                <YAxis
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    domain={[0, "auto"]}
                    tickFormatter={(value: number) =>
                        `${Math.round(value / 1000)}k`
                    }
                    label={{
                        value: "MW",
                        angle: 0,
                        position: "insideTopLeft",
                        offset: 8,
                        style: {
                            fill: "#8a95a1",
                            fontSize: 11,
                            fontFamily: "IBM Plex Mono, monospace",
                        },
                    }}
                />
                <Tooltip
                    contentStyle={{
                        border: "1px solid #c9d2dc",
                        borderRadius: 2,
                        fontSize: 12,
                        fontFamily: "IBM Plex Mono, monospace",
                        background: "#ffffff",
                    }}
                    labelFormatter={(label: unknown) =>
                        `${String(label)} local`
                    }
                    formatter={(value: unknown, name: unknown) => {
                        if (Array.isArray(value)) {
                            const [low, high] = value as number[];
                            return [
                                `${fmtMw(low)} – ${fmtMw(high)} MW`,
                                "P95 band",
                            ];
                        }
                        if (value === null || value === undefined) {
                            return ["—", String(name)];
                        }
                        const numeric =
                            typeof value === "number" ? value : Number(value);
                        return [`${fmtMw(numeric)} MW`, String(name)];
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="band"
                    stroke="none"
                    fill="url(#bandFill)"
                    name="P95 band"
                    isAnimationActive={false}
                />
                <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#0e6e7d"
                    strokeWidth={2}
                    dot={false}
                    name="Forecast at gate closure"
                    isAnimationActive={false}
                />
                <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#101822"
                    strokeWidth={1.75}
                    dot={false}
                    strokeDasharray="5 3"
                    name="Settled outturn"
                    isAnimationActive={false}
                />
                <ReferenceLine y={0} stroke="#c9d2dc" />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
