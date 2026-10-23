import {
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
import { countFormatter, tooltipFormatter } from "../components/tooltip";
import {
    ErrorState,
    Loading,
    Panel,
    StatTile,
    fmtMw,
    fmtPct,
    fmtSigned,
} from "../components/ui";

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

export function Accuracy() {
    const summary = useAsync(() => api.accuracySummary(), []);
    const distribution = useAsync(() => api.distribution(), []);
    const leadTime = useAsync(() => api.byLeadTime(), []);
    const byHour = useAsync(() => api.byHour(), []);
    const byWeekday = useAsync(() => api.byWeekday(), []);
    const series = useAsync(() => api.accuracySeries(), []);
    const baselines = useAsync(() => api.baselines(), []);
    const ribbon = useAsync(() => api.ribbon(), []);

    if (summary.loading) return <Loading label="Loading accuracy analysis" />;
    if (summary.error)
        return <ErrorState message={summary.error} onRetry={summary.reload} />;

    const headline = summary.data?.headline;
    const quantileRows = Object.entries(
        summary.data?.abs_error_quantiles_mw ?? {},
    );
    const ribbonData = ribbon.data ? buildRibbon(ribbon.data) : null;

    return (
        <>
            <div className="page-head">
                <div>
                    <h1 className="page-head__title">Forecast accuracy</h1>
                    <p className="page-head__lead">
                        How wrong the day-ahead wind forecast has been, measured
                        exactly the way the desk would experience it: the
                        forecast published before the 11:00 gate closure on
                        D&#8209;1, compared hour by hour with the settled
                        outturn for January&nbsp;2026.
                    </p>
                </div>
                <div className="page-head__aside">
                    {summary.data?.window.from} → {summary.data?.window.to}
                    <br />
                    {summary.data?.delivery_days} delivery days ·{" "}
                    {headline?.n.toLocaleString()} samples
                </div>
            </div>

            <div className="grid grid--stats" style={{ marginBottom: 16 }}>
                <StatTile
                    label="Mean absolute error"
                    value={fmtMw(headline?.mae_mw)}
                    unit="MW"
                    tone="sea"
                    foot={`RMSE ${fmtMw(headline?.rmse_mw)} MW`}
                />
                <StatTile
                    label="Bias"
                    value={fmtSigned(headline?.bias_mw)}
                    unit="MW"
                    tone={(headline?.bias_mw ?? 0) > 0 ? "rust" : "pine"}
                    foot="forecast minus outturn"
                />
                <StatTile
                    label="Normalised MAE"
                    value={fmtPct(headline?.nmae_pct)}
                    foot={`MAPE ${fmtPct(headline?.mape_pct)} · sMAPE ${fmtPct(
                        headline?.smape_pct,
                    )}`}
                />
                <StatTile
                    label="Correlation"
                    value={(headline?.correlation ?? 0).toFixed(3)}
                    foot={`error σ ${fmtMw(headline?.error_std_mw)} MW`}
                />
                <StatTile
                    label="Daily energy error"
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
                    foot={`mean |error| ${fmtMw(
                        summary.data?.energy_error?.mae_mwh,
                    )} MWh/day`}
                />
            </div>

            <div className="grid grid--2">
                <Panel
                    title="Error distribution"
                    note={`${distribution.data?.histogram.count ?? 0} hourly errors`}
                >
                    {distribution.loading ? (
                        <Loading label="Loading distribution" />
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart
                                    data={
                                        distribution.data?.histogram.bins ?? []
                                    }
                                    margin={{
                                        top: 8,
                                        right: 8,
                                        bottom: 0,
                                        left: 0,
                                    }}
                                >
                                    <CartesianGrid
                                        stroke="#e6ebf0"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="mid"
                                        tick={AXIS}
                                        tickLine={false}
                                        axisLine={{ stroke: "#c9d2dc" }}
                                        tickFormatter={(value: number) =>
                                            `${(value / 1000).toFixed(1)}k`
                                        }
                                    />
                                    <YAxis
                                        tick={AXIS}
                                        tickLine={false}
                                        axisLine={false}
                                        width={40}
                                    />
                                    <Tooltip
                                        {...TOOLTIP}
                                        formatter={countFormatter("periods")}
                                        labelFormatter={(label: unknown) =>
                                            `error ${(
                                                Math.round(
                                                    Number(label) / 100,
                                                ) / 10
                                            ).toFixed(1)} kMW`
                                        }
                                    />
                                    <Bar
                                        dataKey="count"
                                        name="periods"
                                        isAnimationActive={false}
                                    >
                                        {(
                                            distribution.data?.histogram.bins ??
                                            []
                                        ).map((bin) => (
                                            <Cell
                                                key={bin.mid}
                                                fill={
                                                    bin.mid >= 0
                                                        ? "#b4531b"
                                                        : "#3f6212"
                                                }
                                                fillOpacity={0.8}
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
                                    over-forecast (wind shortfall)
                                </span>
                                <span className="legend__item">
                                    <span
                                        className="legend__swatch"
                                        style={{ background: "#3f6212" }}
                                    />
                                    under-forecast (wind surplus)
                                </span>
                                <span style={{ marginLeft: "auto" }}>
                                    {fmtPct(
                                        distribution.data
                                            ?.share_under_forecast_pct,
                                    )}{" "}
                                    of periods came in below forecast
                                </span>
                            </div>
                        </>
                    )}
                </Panel>

                <Panel
                    title="Error by forecast lead time"
                    note="every publication vintage"
                >
                    {leadTime.loading ? (
                        <Loading label="Loading lead-time analysis" />
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={250}>
                                <ComposedChart
                                    data={leadTime.data?.buckets ?? []}
                                    margin={{
                                        top: 8,
                                        right: 8,
                                        bottom: 0,
                                        left: 0,
                                    }}
                                >
                                    <CartesianGrid
                                        stroke="#e6ebf0"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="key"
                                        tick={AXIS}
                                        tickLine={false}
                                        axisLine={{ stroke: "#c9d2dc" }}
                                    />
                                    <YAxis
                                        tick={AXIS}
                                        tickLine={false}
                                        axisLine={false}
                                        width={50}
                                    />
                                    <Tooltip
                                        {...TOOLTIP}
                                        formatter={tooltipFormatter(
                                            "MW",
                                            0,
                                            (name, value) =>
                                                name === "mae_mw"
                                                    ? `${fmtMw(value)} MW`
                                                    : `${value.toLocaleString()} samples`,
                                        )}
                                    />
                                    <Bar
                                        dataKey="mae_mw"
                                        name="mae"
                                        fill="#0e6e7d"
                                        fillOpacity={0.85}
                                        isAnimationActive={false}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                            <div className="note" style={{ marginTop: 8 }}>
                                The published forecast is least reliable at long
                                horizons; the gate-closure vintage sits in the
                                12&#8209;36&nbsp;h band, where the measured MAE
                                is the number the planning band is built from.
                            </div>
                        </>
                    )}
                </Panel>
            </div>

            <div className="grid grid--2">
                <Panel title="Error by hour of day" note="local delivery time">
                    {byHour.loading ? (
                        <Loading label="Loading hourly profile" />
                    ) : (
                        <ResponsiveContainer width="100%" height={230}>
                            <ComposedChart
                                data={byHour.data ?? []}
                                margin={{
                                    top: 8,
                                    right: 8,
                                    bottom: 0,
                                    left: 0,
                                }}
                            >
                                <CartesianGrid
                                    stroke="#e6ebf0"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="key"
                                    tick={AXIS}
                                    tickLine={false}
                                    axisLine={{ stroke: "#c9d2dc" }}
                                />
                                <YAxis
                                    tick={AXIS}
                                    tickLine={false}
                                    axisLine={false}
                                    width={50}
                                />
                                <Tooltip
                                    {...TOOLTIP}
                                    formatter={tooltipFormatter(
                                        "MW",
                                        0,
                                        (name, value) =>
                                            name === "mae_mw"
                                                ? `${fmtMw(value)} MW`
                                                : `${fmtSigned(value)} MW`,
                                    )}
                                />
                                <Bar
                                    dataKey="mae_mw"
                                    name="mae_mw"
                                    fill="#0e6e7d"
                                    fillOpacity={0.8}
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="bias_mw"
                                    stroke="#b4531b"
                                    strokeWidth={1.5}
                                    dot={false}
                                    name="bias_mw"
                                    isAnimationActive={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </Panel>

                <Panel title="Error by weekday" note="delivery day">
                    {byWeekday.loading ? (
                        <Loading label="Loading weekday profile" />
                    ) : (
                        <ResponsiveContainer width="100%" height={230}>
                            <ComposedChart
                                data={byWeekday.data ?? []}
                                margin={{
                                    top: 8,
                                    right: 8,
                                    bottom: 0,
                                    left: 0,
                                }}
                            >
                                <CartesianGrid
                                    stroke="#e6ebf0"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="key"
                                    tick={AXIS}
                                    tickLine={false}
                                    axisLine={{ stroke: "#c9d2dc" }}
                                />
                                <YAxis
                                    tick={AXIS}
                                    tickLine={false}
                                    axisLine={false}
                                    width={50}
                                />
                                <Tooltip
                                    {...TOOLTIP}
                                    formatter={tooltipFormatter(
                                        "MW",
                                        0,
                                        (name, value) =>
                                            name === "mae_mw"
                                                ? `${fmtMw(value)} MW`
                                                : `${fmtSigned(value)} MW`,
                                    )}
                                />
                                <Bar
                                    dataKey="mae_mw"
                                    name="mae_mw"
                                    fill="#0e6e7d"
                                    fillOpacity={0.8}
                                    isAnimationActive={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </Panel>
            </div>

            <div className="grid grid--2">
                <Panel
                    title="Forecast skill versus a naive baseline"
                    note={baselines.data?.baseline}
                >
                    {baselines.loading ? (
                        <Loading label="Loading baselines" />
                    ) : (
                        <>
                            <div
                                className="grid grid--stats"
                                style={{ marginBottom: 12 }}
                            >
                                <StatTile
                                    label="Skill score"
                                    value={fmtPct(
                                        baselines.data?.skill.skill_score_pct,
                                    )}
                                    tone={
                                        (baselines.data?.skill
                                            .skill_score_pct ?? 0) > 0
                                            ? "sea"
                                            : "rust"
                                    }
                                    foot="positive = published forecast beats the baseline"
                                />
                                <StatTile
                                    label="Forecast MAE"
                                    value={fmtMw(baselines.data?.skill.mae_mw)}
                                    unit="MW"
                                />
                                <StatTile
                                    label="Baseline MAE"
                                    value={fmtMw(
                                        baselines.data?.skill.baseline_mae_mw,
                                    )}
                                    unit="MW"
                                />
                            </div>
                            <div className="note">
                                The baseline carries yesterday&rsquo;s outturn
                                forward 24 hours — the assumption a desk falls
                                back on when no forecast is trusted. A positive
                                skill score means the published forecast is the
                                better input to the day-ahead purchase.
                            </div>
                        </>
                    )}
                </Panel>

                <Panel title="Error quantiles" note="absolute error, MW">
                    <table className="dtable">
                        <thead>
                            <tr>
                                <th>Quantile</th>
                                <th className="num">Absolute error MW</th>
                                <th className="num">If it held all day</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quantileRows.map(([key, value]) => (
                                <tr key={key}>
                                    <td>{key.replace("p", "P")}</td>
                                    <td className="num">{fmtMw(value)}</td>
                                    <td className="num">
                                        {((value * 24) / 1000).toFixed(1)} GWh
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="note" style={{ marginTop: 10 }}>
                        The P95 row is the band the desk plans against: in
                        95&nbsp;% of settlement periods the outturn stayed
                        within that distance of the gate-closure forecast. The
                        last column shows what that error would be worth if it
                        persisted for a whole delivery day.
                    </div>
                </Panel>
            </div>

            <Panel
                title="Settlement-period error ribbon, January 2026"
                note="signed error per settlement period, coloured by direction"
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
                    <ErrorRibbon
                        days={ribbonData.days}
                        maxAbs={ribbonData.maxAbs}
                    />
                ) : null}
            </Panel>

            <Panel
                title="Daily error detail"
                note="worst days first"
                actions={
                    <a className="button" href={api.csvUrl()}>
                        Download CSV
                    </a>
                }
                flush
            >
                <div className="table-scroll">
                    <table className="dtable">
                        <thead>
                            <tr>
                                <th>Delivery day</th>
                                <th className="num">Forecast GWh</th>
                                <th className="num">Outturn GWh</th>
                                <th className="num">Error MWh</th>
                                <th className="num">Error %</th>
                                <th className="num">MAE MW</th>
                                <th className="num">Bias MW</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...(series.data ?? [])]
                                .sort(
                                    (a, b) =>
                                        Math.abs(b.error_mwh) -
                                        Math.abs(a.error_mwh),
                                )
                                .map((row) => (
                                    <tr key={row.delivery_date}>
                                        <td>{row.delivery_date}</td>
                                        <td className="num">
                                            {(
                                                row.forecast_energy_mwh / 1000
                                            ).toFixed(3)}
                                        </td>
                                        <td className="num">
                                            {(
                                                row.actual_energy_mwh / 1000
                                            ).toFixed(3)}
                                        </td>
                                        <td
                                            className={`num ${
                                                row.error_mwh > 0
                                                    ? "pos"
                                                    : "neg"
                                            }`}
                                        >
                                            {fmtSigned(row.error_mwh)}
                                        </td>
                                        <td className="num">
                                            {fmtPct(row.error_pct)}
                                        </td>
                                        <td className="num">
                                            {fmtMw(row.mae_mw)}
                                        </td>
                                        <td className="num">
                                            {fmtSigned(row.bias_mw)}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </>
    );
}
