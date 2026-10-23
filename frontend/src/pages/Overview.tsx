import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { api, useAsync } from "../api/client";
import { ErrorRibbon, type RibbonDay } from "../components/ErrorRibbon";
import { DayStrip } from "../components/DayStrip";
import { tooltipFormatter } from "../components/tooltip";
import { WindProfileChart } from "../components/WindProfileChart";
import {
    ErrorState,
    Loading,
    Panel,
    StatTile,
    fmtGwh,
    fmtMw,
    fmtPct,
    fmtSigned,
} from "../components/ui";
import { useSelectedDay } from "../hooks/useSelectedDay";

const AXIS = {
    stroke: "#c9d2dc",
    fontSize: 11,
    fontFamily: "IBM Plex Mono, monospace",
};
const TOOLTIP = {
    contentStyle: {
        border: "1px solid #c9d2dc",
        borderRadius: 2,
        fontSize: 12,
        fontFamily: "IBM Plex Mono, monospace",
        background: "#ffffff",
    },
};

function buildRibbon(rows: import("../api/types").RibbonRow[]): {
    days: RibbonDay[];
    maxAbs: number;
} {
    const byDay = new Map<string, number[]>();
    for (const row of rows) {
        const cells = byDay.get(row.delivery_date) ?? [];
        cells[row.settlement_period - 1] = row.error_mw;
        byDay.set(row.delivery_date, cells);
    }
    const days: RibbonDay[] = [];
    let maxAbs = 0;
    for (const [delivery_date, cells] of byDay) {
        const filled = Array.from(
            { length: 48 },
            (_, index) => cells[index] ?? 0,
        );
        const meanError =
            filled.reduce((total, value) => total + value, 0) /
            (filled.length || 1);
        maxAbs = Math.max(maxAbs, ...filled.map(Math.abs));
        days.push({ delivery_date, cells: filled, meanError, maxAbs: 0 });
    }
    days.sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
    return { days, maxAbs };
}

export function Overview() {
    const { day, setDay } = useSelectedDay();
    const meta = useAsync(() => api.meta(), []);
    const summary = useAsync(() => api.accuracySummary(), []);
    const series = useAsync(() => api.accuracySeries(), []);
    const ribbon = useAsync(() => api.ribbon(), []);
    const decision = useAsync(() => api.decision(day), [day]);

    if (meta.loading || summary.loading || series.loading)
        return <Loading label="Loading January position" />;
    if (meta.error)
        return <ErrorState message={meta.error} onRetry={meta.reload} />;
    if (summary.error)
        return <ErrorState message={summary.error} onRetry={summary.reload} />;

    const headline = summary.data?.headline;
    const bands = summary.data?.bands;
    const rows = series.data ?? [];
    const energySeries = rows.map((row) => ({
        date: row.delivery_date.slice(8, 10),
        forecast: row.forecast_energy_mwh / 1000,
        actual: row.actual_energy_mwh / 1000,
        error: row.error_mwh / 1000,
        errorPct: row.error_pct,
    }));
    const ribbonData = ribbon.data ? buildRibbon(ribbon.data) : null;
    const view = decision.data;

    return (
        <>
            <div className="page-head">
                <div>
                    <h1 className="page-head__title">
                        Day-ahead wind position, January 2026
                    </h1>
                    <p className="page-head__lead">
                        Every number on this page is the forecast the desk could
                        actually have had at gate closure (11:00 local on
                        D&#8209;1), measured against what the wind actually
                        delivered. The error distribution is the desk&rsquo;s
                        procurement risk: it tells you how much thermal capacity
                        to carry on top of the wind position.
                    </p>
                </div>
                <div className="page-head__aside">
                    {meta.data?.coverage.actuals.rows.toLocaleString()} actual
                    periods
                    <br />
                    {meta.data?.coverage.forecasts.rows.toLocaleString()}{" "}
                    forecast vintages
                </div>
            </div>

            <div className="grid grid--stats" style={{ marginBottom: 16 }}>
                <StatTile
                    label="Mean absolute error at gate closure"
                    value={fmtMw(headline?.mae_mw)}
                    unit="MW"
                    tone="sea"
                    foot={`RMSE ${fmtMw(headline?.rmse_mw)} MW · ${headline?.n.toLocaleString()} hourly samples`}
                />
                <StatTile
                    label="Normalised MAE"
                    value={fmtPct(headline?.nmae_pct)}
                    foot={`MAE ÷ mean output ${fmtMw(headline?.mean_actual_mw)} MW`}
                />
                <StatTile
                    label="Bias (forecast − outturn)"
                    value={fmtSigned(headline?.bias_mw)}
                    unit="MW"
                    tone={(headline?.bias_mw ?? 0) > 0 ? "rust" : "pine"}
                    foot={
                        (headline?.bias_mw ?? 0) > 0
                            ? "wind was over-forecast: carry more thermal"
                            : "wind was under-forecast: less thermal needed"
                    }
                />
                <StatTile
                    label="P95 planning band"
                    value={fmtMw(bands?.planning_mw.p95)}
                    unit="MW"
                    tone="rust"
                    foot={`± ${fmtGwh(((bands?.planning_mw.p95 ?? 0) * 24) / 1000)} GWh over a delivery day`}
                />
                <StatTile
                    label="Mean daily energy error"
                    value={fmtSigned(
                        (summary.data?.energy_error?.bias_mwh ?? 0) / 1000,
                        1,
                    )}
                    unit="GWh"
                    tone={
                        (summary.data?.energy_error?.bias_mwh ?? 0) > 0
                            ? "rust"
                            : "pine"
                    }
                    foot={`mean |error| ${fmtMw(summary.data?.energy_error?.mae_mwh)} MWh per day`}
                />
            </div>

            <Panel
                title="Delivery-day wind profile"
                note={
                    view ? (
                        <>
                            {view.delivery_date} · vintage{" "}
                            {view.selected_publish.publish_time
                                ?.slice(0, 16)
                                .replace("T", " ")}{" "}
                            UTC · settled outturn overlaid
                        </>
                    ) : undefined
                }
                actions={
                    <a className="button" href={`/decision?day=${day}`}>
                        Open decision board
                    </a>
                }
            >
                {decision.loading ? (
                    <Loading label="Loading delivery day" />
                ) : decision.error ? (
                    <ErrorState
                        message={decision.error}
                        onRetry={decision.reload}
                    />
                ) : view ? (
                    <>
                        <WindProfileChart points={view.hourly_series} />
                        <div className="legend" style={{ marginTop: 8 }}>
                            <span className="legend__item">
                                <span
                                    className="legend__swatch"
                                    style={{ background: "#0e6e7d" }}
                                />
                                Forecast at gate closure
                            </span>
                            <span className="legend__item">
                                <span
                                    className="legend__swatch"
                                    style={{ background: "#101822" }}
                                />
                                Settled outturn
                            </span>
                            <span className="legend__item">
                                <span
                                    className="legend__swatch"
                                    style={{
                                        background: "rgba(14,110,125,0.25)",
                                    }}
                                />
                                P95 error band
                            </span>
                            <span style={{ marginLeft: "auto" }}>
                                day-ahead energy error{" "}
                                {fmtSigned(view.daily.error_mwh / 1000, 1)} GWh
                                ({fmtPct(view.daily.error_pct)})
                            </span>
                        </div>
                    </>
                ) : null}
            </Panel>

            <div className="grid grid--2">
                <Panel
                    title="Wind energy, forecast versus outturn"
                    note="GWh per delivery day"
                >
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart
                            data={energySeries}
                            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        >
                            <CartesianGrid stroke="#e6ebf0" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tick={AXIS}
                                tickLine={false}
                                axisLine={{ stroke: "#c9d2dc" }}
                            />
                            <YAxis
                                tick={AXIS}
                                tickLine={false}
                                axisLine={false}
                                width={44}
                            />
                            <Tooltip
                                {...TOOLTIP}
                                formatter={tooltipFormatter("GWh", 1)}
                            />
                            <Area
                                type="monotone"
                                dataKey="forecast"
                                stroke="#0e6e7d"
                                strokeWidth={1.75}
                                fill="rgba(14,110,125,0.12)"
                                name="Forecast"
                                isAnimationActive={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                stroke="#101822"
                                strokeWidth={1.75}
                                strokeDasharray="5 3"
                                dot={false}
                                name="Outturn"
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Panel>

                <Panel
                    title="Daily energy error"
                    note="forecast minus outturn, GWh"
                >
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart
                            data={energySeries}
                            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        >
                            <CartesianGrid stroke="#e6ebf0" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tick={AXIS}
                                tickLine={false}
                                axisLine={{ stroke: "#c9d2dc" }}
                            />
                            <YAxis
                                tick={AXIS}
                                tickLine={false}
                                axisLine={false}
                                width={44}
                            />
                            <Tooltip
                                {...TOOLTIP}
                                formatter={tooltipFormatter("GWh", 2)}
                            />
                            <Bar
                                dataKey="error"
                                name="Error"
                                isAnimationActive={false}
                            >
                                {energySeries.map((row) => (
                                    <Cell
                                        key={row.date}
                                        fill={
                                            row.error >= 0
                                                ? "#b4531b"
                                                : "#3f6212"
                                        }
                                        fillOpacity={0.75}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="legend" style={{ marginTop: 6 }}>
                        <span className="legend__item">
                            <span
                                className="legend__swatch"
                                style={{ background: "#b4531b" }}
                            />
                            shortfall: more thermal needed
                        </span>
                        <span className="legend__item">
                            <span
                                className="legend__swatch"
                                style={{ background: "#3f6212" }}
                            />
                            surplus: less thermal needed
                        </span>
                    </div>
                </Panel>
            </div>

            <Panel
                title="Settlement-period error ribbon, January 2026"
                note="one row per delivery day, 48 settlement periods, gate-closure forecast"
                flush
            >
                {ribbon.loading ? <Loading label="Loading ribbon" /> : null}
                {ribbon.error ? (
                    <ErrorState
                        message={ribbon.error}
                        onRetry={ribbon.reload}
                    />
                ) : null}
                {ribbonData ? (
                    <>
                        <DayStrip
                            series={rows}
                            selected={day}
                            onSelect={setDay}
                        />
                        <ErrorRibbon
                            days={ribbonData.days}
                            maxAbs={ribbonData.maxAbs}
                            selected={day}
                            onSelect={setDay}
                        />
                    </>
                ) : null}
            </Panel>
        </>
    );
}
