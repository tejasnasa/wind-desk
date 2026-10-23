import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { api, useAsync } from "../api/client";
import { DayStrip } from "../components/DayStrip";
import { tooltipFormatter } from "../components/tooltip";
import { WindProfileChart } from "../components/WindProfileChart";
import {
    ErrorState,
    Legend,
    Loading,
    Panel,
    Pill,
    StatTile,
    fmtDateTime,
    fmtGwh,
    fmtMwh,
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

export function DecisionBoard() {
    const { day, setDay } = useSelectedDay();
    const series = useAsync(() => api.accuracySeries(), []);
    const view = useAsync(() => api.decision(day), [day]);

    if (series.loading) return <Loading label="Loading decision board" />;
    if (series.error)
        return <ErrorState message={series.error} onRetry={series.reload} />;

    const rows = series.data ?? [];
    const data = view.data;
    const selected = data?.selected_publish;
    const timelineData = (data?.timeline ?? []).map((row) => ({
        label: row.publish_local,
        mae: row.mae_mw,
        bias: row.bias_mw,
        error: row.error_mwh,
        publish: row.publish_time,
    }));

    return (
        <>
            <div className="page-head">
                <div>
                    <h1 className="page-head__title">
                        Day-ahead decision board
                    </h1>
                    <p className="page-head__lead">
                        What the desk would have known at the 11:00 gate closure
                        on D&#8209;1, and how far the wind then strayed from it.
                        Pick a delivery day to load its forecast vintage.
                    </p>
                </div>
                <div className="page-head__aside">
                    {rows.length} delivery days loaded
                    <br />
                    decision cut-off 11:00 Europe/London
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 16 }}>
                <DayStrip series={rows} selected={day} onSelect={setDay} />
            </div>

            {view.loading ? <Loading label="Loading delivery day" /> : null}
            {view.error ? (
                <ErrorState message={view.error} onRetry={view.reload} />
            ) : null}

            {data ? (
                <>
                    <div
                        className="grid grid--stats"
                        style={{ marginBottom: 16 }}
                    >
                        <StatTile
                            label="Forecast vintage used"
                            value={
                                selected?.publish_time
                                    ? fmtDateTime(selected.publish_time)
                                    : "none"
                            }
                            foot={
                                selected?.publish_time
                                    ? `published ${selected.covered_hours}/${selected.expected_hours} h of the day`
                                    : "no publication available at cut-off"
                            }
                        />
                        <StatTile
                            label="Wind energy, forecast"
                            value={fmtGwh(
                                data.daily.forecast_energy_mwh / 1000,
                            )}
                            unit="GWh"
                            tone="sea"
                            foot={`mean ${fmtMw(
                                data.daily.mean_forecast_mw,
                            )} MW across the day`}
                        />
                        <StatTile
                            label="Wind energy, outturn"
                            value={fmtGwh(data.daily.actual_energy_mwh / 1000)}
                            unit="GWh"
                            foot={`mean ${fmtMw(
                                data.daily.mean_actual_mw,
                            )} MW across the day`}
                        />
                        <StatTile
                            label="Energy error"
                            value={fmtSigned(data.daily.error_mwh / 1000, 2)}
                            unit="GWh"
                            tone={data.daily.error_mwh > 0 ? "rust" : "pine"}
                            foot={`${fmtPct(data.daily.error_pct)} of the delivered energy`}
                        />
                        <StatTile
                            label="Error inside the hour"
                            value={fmtMw(data.daily.mae_mw)}
                            unit="MW MAE"
                            foot={`bias ${fmtSigned(data.daily.bias_mw)} MW · nMAE ${fmtPct(
                                data.daily.nmae_pct,
                            )}`}
                        />
                    </div>

                    <Panel
                        title={`Wind profile for ${data.delivery_date}`}
                        note={`cut-off ${fmtDateTime(data.cutoff)} · ${data.gate_closure_local} local on D-1`}
                    >
                        <WindProfileChart
                            points={data.hourly_series}
                            height={360}
                        />
                        <div className="legend" style={{ marginTop: 10 }}>
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
                                P95 empirical band
                            </span>
                        </div>
                    </Panel>

                    <div className="grid grid--wide">
                        <Panel
                            title="Information timeline"
                            note="every publication that existed before the cut-off"
                        >
                            {timelineData.length ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart
                                        data={timelineData}
                                        margin={{
                                            top: 8,
                                            right: 10,
                                            bottom: 0,
                                            left: 0,
                                        }}
                                    >
                                        <CartesianGrid
                                            stroke="#e6ebf0"
                                            vertical={false}
                                        />
                                        <XAxis
                                            dataKey="label"
                                            tick={AXIS}
                                            tickLine={false}
                                            axisLine={{ stroke: "#c9d2dc" }}
                                            interval="preserveStartEnd"
                                            minTickGap={16}
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
                                                    name === "error"
                                                        ? `${value.toFixed(0)} MWh`
                                                        : `${value.toFixed(0)} MW`,
                                            )}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="mae"
                                            stroke="#0e6e7d"
                                            strokeWidth={2}
                                            dot={false}
                                            name="mae"
                                            isAnimationActive={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="bias"
                                            stroke="#b4531b"
                                            strokeWidth={1.5}
                                            strokeDasharray="4 3"
                                            dot={false}
                                            name="bias"
                                            isAnimationActive={false}
                                        />
                                        <ReferenceDot
                                            x={
                                                timelineData[
                                                    timelineData.length - 1
                                                ]?.label
                                            }
                                            y={
                                                timelineData[
                                                    timelineData.length - 1
                                                ]?.mae
                                            }
                                            r={4}
                                            fill="#0e6e7d"
                                            stroke="#ffffff"
                                            strokeWidth={2}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="note">
                                    No publication existed before the cut-off
                                    for this day.
                                </div>
                            )}
                            <div className="note" style={{ marginTop: 8 }}>
                                The last point is the vintage used for the
                                decision. Earlier points show how the forecast
                                evolved through the preceding day — the desk
                                sees the shape of the information, not just the
                                final number.
                            </div>
                        </Panel>

                        <Panel
                            title="Procurement risk band"
                            note="calibrated on January decision-horizon errors"
                        >
                            <dl className="kv">
                                <dt>Calibration sample</dt>
                                <dd>
                                    {data.bands.n.toLocaleString()} hourly
                                    errors
                                </dd>
                                <dt>P50 band</dt>
                                <dd>
                                    ±{fmtMw(data.bands.planning_mw.p50)} MW ·{" "}
                                    {fmtMwh(data.bands.energy.p50.band_mwh)} MWh
                                </dd>
                                <dt>P80 band</dt>
                                <dd>
                                    ±{fmtMw(data.bands.planning_mw.p80)} MW ·{" "}
                                    {fmtMwh(data.bands.energy.p80.band_mwh)} MWh
                                </dd>
                                <dt>P95 band</dt>
                                <dd>
                                    ±{fmtMw(data.bands.planning_mw.p95)} MW ·{" "}
                                    {fmtMwh(data.bands.energy.p95.band_mwh)} MWh
                                </dd>
                                <dt>Downside P95</dt>
                                <dd>
                                    {fmtMw(data.bands.energy.p95.downside_mw)}{" "}
                                    MW ·{" "}
                                    {fmtMwh(data.bands.energy.p95.downside_mwh)}{" "}
                                    MWh
                                </dd>
                                <dt>Upside P95</dt>
                                <dd>
                                    {fmtMw(data.bands.energy.p95.upside_mw)} MW
                                    · {fmtMwh(data.bands.energy.p95.upside_mwh)}{" "}
                                    MWh
                                </dd>
                            </dl>
                            <div className="note" style={{ marginTop: 12 }}>
                                The downside figure is the wind shortfall the
                                desk must cover with thermal or purchases in the
                                balancing market: on average the outturn came in{" "}
                                {fmtMw(data.bands.energy.p95.downside_mw)} MW
                                below the forecast in the worst 5&nbsp;% of
                                settlement periods.
                            </div>
                            <div
                                style={{
                                    marginTop: 10,
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                <Pill tone="sea">
                                    gate closure {data.gate_closure_local}
                                </Pill>
                                <Pill
                                    tone={selected?.complete ? "sea" : "rust"}
                                >
                                    {selected?.complete
                                        ? "full day coverage"
                                        : "partial coverage"}
                                </Pill>
                                <Pill>
                                    {data.coverage.actual_hours}/24 actual hours
                                </Pill>
                            </div>
                        </Panel>
                    </div>

                    <Panel
                        title="Settlement periods"
                        note="half-hourly view; the hourly forecast is held flat across each hour"
                        flush
                    >
                        <div className="table-scroll">
                            <table className="dtable">
                                <thead>
                                    <tr>
                                        <th>SP</th>
                                        <th>Time (local)</th>
                                        <th className="num">Forecast MW</th>
                                        <th className="num">Outturn MW</th>
                                        <th className="num">Error MW</th>
                                        <th>Direction</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.settlement_series.map((row) => (
                                        <tr key={row.settlement_period}>
                                            <td>{row.settlement_period}</td>
                                            <td>{row.local_time}</td>
                                            <td className="num">
                                                {fmtMw(row.forecast_mw)}
                                            </td>
                                            <td className="num">
                                                {fmtMw(row.actual_mw)}
                                            </td>
                                            <td
                                                className={`num ${
                                                    (row.error_mw ?? 0) > 0
                                                        ? "pos"
                                                        : "neg"
                                                }`}
                                            >
                                                {fmtSigned(row.error_mw)}
                                            </td>
                                            <td>
                                                {row.error_mw === null
                                                    ? "—"
                                                    : row.error_mw > 0
                                                      ? "shortfall"
                                                      : row.error_mw < 0
                                                        ? "surplus"
                                                        : "on forecast"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="note" style={{ padding: "10px 16px" }}>
                            <Legend
                                items={[
                                    {
                                        color: "#b4531b",
                                        label: "wind below forecast — carry more thermal",
                                    },
                                    {
                                        color: "#3f6212",
                                        label: "wind above forecast — surplus",
                                    },
                                ]}
                            />
                        </div>
                    </Panel>
                </>
            ) : null}
        </>
    );
}
