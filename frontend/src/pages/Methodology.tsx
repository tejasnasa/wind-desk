import { api, useAsync } from "../api/client";
import { ErrorState, Loading, Panel, fmtDateTime } from "../components/ui";

export function Methodology() {
    const meta = useAsync(() => api.meta(), []);
    const runs = useAsync(() => api.dataRuns(), []);

    if (meta.loading) return <Loading label="Loading methodology" />;
    if (meta.error)
        return <ErrorState message={meta.error} onRetry={meta.reload} />;

    const info = meta.data;
    const cadence = Object.entries(info?.publication_cadence_local ?? {});
    const regular = new Set([
        "02:30",
        "04:30",
        "07:30",
        "09:30",
        "11:30",
        "15:30",
        "18:30",
        "22:30",
    ]);
    const irregular = cadence.filter(([time]) => !regular.has(time));

    return (
        <>
            <div className="page-head">
                <div>
                    <h1 className="page-head__title">
                        Methodology, data and limitations
                    </h1>
                    <p className="page-head__lead">
                        Every figure in Wind Desk is recomputed from the stored
                        Elexon data on request. This page states the rules, the
                        assumptions and the things a reviewer should be
                        sceptical about.
                    </p>
                </div>
                <div className="page-head__aside">
                    source {info?.data_source.name}
                    <br />
                    {info?.data_source.base_url}
                </div>
            </div>

            <div className="grid grid--2">
                <Panel title="Data source">
                    <div className="prose">
                        <p>Two Elexon datasets, both public and key-free:</p>
                        <ul>
                            <li>
                                <code>FUELHH</code> — actual generation by fuel
                                type. Filtered to <code>fuelType=WIND</code>:
                                national half-hourly wind output, 48 settlement
                                periods per day.
                            </li>
                            <li>
                                <code>WINDFOR</code> — the published wind
                                forecast. Each row is one target hour and one
                                publication vintage; the publisher issues eight
                                vintages a day.
                            </li>
                        </ul>
                        <p>
                            The endpoints named in the brief (
                            <code>bmrs.elexon.co.uk</code>) now serve a retired
                            SPA shell. The live Insights API exposes the same
                            resources at{" "}
                            <code>data.elexon.co.uk/bmrs/api/v1</code>, but the
                            query parameters changed: actuals are filtered with{" "}
                            <code>settlementDateFrom</code>/
                            <code>settlementDateTo</code> and forecasts with{" "}
                            <code>publishDateTimeFrom</code>/
                            <code>publishDateTimeTo</code>. The legacy{" "}
                            <code>publishDate</code> parameter is silently
                            ignored by the current API — the ingestion code uses
                            the parameter names from the published OpenAPI
                            document.
                        </p>
                        <p className="note">{info?.data_source.note}</p>
                    </div>
                </Panel>

                <Panel title="The decision rule">
                    <div className="prose">
                        <p>
                            The day-ahead auction closes at{" "}
                            <strong>
                                11:00 local (Europe/London) on D&#8209;1
                            </strong>{" "}
                            for delivery day D. Wind Desk therefore treats the
                            decision cut-off for delivery day D as that instant,
                            and selects:
                        </p>
                        <p>
                            <code>
                                the latest publication with publish_time ≤
                                cut-off
                            </code>
                        </p>
                        <p>
                            For January 2026 the vintages are published at
                            02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and
                            22:30 UTC, so the 09:30 publication is the newest
                            information the desk holds at gate closure — the
                            11:30 vintage arrives 30 minutes after the auction
                            has closed. Every delivery day in the pilot window
                            is covered for all 24 hours by that vintage.
                        </p>
                        <p>
                            Any other cut-off can be queried through the{" "}
                            <code>as_of</code> parameter, which is how the
                            information timeline on the decision board is built.
                        </p>
                    </div>
                </Panel>
            </div>

            <div className="grid grid--2">
                <Panel title="Aligning the two time grids">
                    <div className="prose">
                        <p>
                            Actual generation is half-hourly; the forecast is
                            published hourly. Any error number therefore depends
                            on how the two grids are reconciled, so the
                            reconciliation is explicit and lives in one module (
                            <code>analytics/grids.py</code>).
                        </p>
                        <ul>
                            <li>
                                <strong>Primary metrics (hourly).</strong> The
                                two settlement periods of an hour are combined
                                into the hour&rsquo;s energy-weighted mean MW,
                                and compared with the forecast for that hour.
                                This is the only comparison that does not invent
                                resolution.
                            </li>
                            <li>
                                <strong>
                                    Settlement-period view (indicative).
                                </strong>{" "}
                                The hourly forecast is held flat across the two
                                half-hour periods it covers. Energy is preserved
                                exactly by the transform, but the shape of a
                                half-hourly ramp is not in the data and is not
                                invented either — the UI labels this view as
                                indicative.
                            </li>
                        </ul>
                    </div>
                </Panel>

                <Panel title="From measured error to a planning band">
                    <div className="prose">
                        <p>
                            The band is empirical, not distributional. From
                            every decision-horizon error in the window the app
                            takes the quantiles of the absolute error, of the
                            downside (actual below forecast) and of the upside.
                        </p>
                        <ul>
                            <li>
                                <strong>Flat band</strong> — quantile of |error|
                                in MW.
                            </li>
                            <li>
                                <strong>Level-scaled band</strong> — quantile of
                                the error relative to the mean output of the day
                                it belongs to, re-applied to the level of the
                                day being planned. A windy day carries a bigger
                                absolute error than a calm one.
                            </li>
                            <li>
                                <strong>Planning band</strong> — the more
                                conservative of the two, at P50, P80 and P95.
                            </li>
                        </ul>
                        <p>
                            The desk uses the band as the thermal-procurement
                            buffer: with the wind forecast F and a band B, the
                            residual requirement must be covered up to
                            F&nbsp;−&nbsp;B in the downside case.
                        </p>
                    </div>
                </Panel>
            </div>

            <Panel title="Metric definitions">
                <dl className="definition">
                    <dt>error</dt>
                    <dd>
                        forecast MW − outturn MW. Positive means the forecast
                        was above the outturn (wind under-delivered, more
                        thermal needed).
                    </dd>
                    <dt>MAE</dt>
                    <dd>
                        mean absolute error in MW — the typical distance between
                        forecast and outturn.
                    </dd>
                    <dt>RMSE</dt>
                    <dd>
                        root mean squared error in MW — penalises the large
                        misses more heavily than MAE.
                    </dd>
                    <dt>bias</dt>
                    <dd>
                        mean signed error in MW — a systematic over- or
                        under-forecast.
                    </dd>
                    <dt>nMAE</dt>
                    <dd>
                        MAE ÷ mean actual output: a scale-free headline for the
                        desk.
                    </dd>
                    <dt>MAPE</dt>
                    <dd>
                        mean absolute percentage error, computed only on periods
                        whose outturn is at least 1 % of the sample mean
                        (near-zero outturns make percentage error meaningless);
                        the number of excluded periods is reported.
                    </dd>
                    <dt>sMAPE</dt>
                    <dd>
                        symmetric MAPE, defined even when the outturn is close
                        to zero.
                    </dd>
                    <dt>energy error</dt>
                    <dd>
                        Σ error × Δt over a delivery day, in MWh — the quantity
                        that actually drives the thermal purchase.
                    </dd>
                    <dt>lead time</dt>
                    <dd>
                        target time minus publication time; the horizon at which
                        a forecast vintage was made.
                    </dd>
                    <dt>skill score</dt>
                    <dd>
                        1 − MAE(forecast) ÷ MAE(baseline), where the baseline
                        carries yesterday&rsquo;s outturn forward 24 hours.
                        Positive means the published forecast beats the naive
                        assumption.
                    </dd>
                </dl>
            </Panel>

            <div className="grid grid--2">
                <Panel title="Data quality observations">
                    <div className="prose">
                        <ul>
                            <li>
                                The actuals for the pilot window are complete:
                                every one of the 31 January delivery days
                                carries all 48 settlement periods, with no null
                                and no zero readings.
                            </li>
                            <li>
                                The publisher issues eight vintages a day at a
                                fixed cadence. In the ingested window{" "}
                                {irregular.length ? (
                                    <>
                                        one publication fell outside the regular
                                        cadence:{" "}
                                        <code>
                                            {irregular
                                                .map(
                                                    ([time, count]) =>
                                                        `${time} (×${count})`,
                                                )
                                                .join(", ")}
                                        </code>
                                        .
                                    </>
                                ) : (
                                    <>
                                        every publication fell on the regular
                                        cadence.
                                    </>
                                )}{" "}
                                The decision rule is unaffected, because the
                                affected day&rsquo;s 09:30 vintage is still the
                                newest information before the cut-off.
                            </li>
                            <li>
                                Forecast values repeat across consecutive
                                vintages for the near-term periods: the
                                publisher freezes the current half-hour forecast
                                and rolls it forward, so short-horizon
                                improvements are lumpy.
                            </li>
                            <li>
                                Actual generation is published about a day after
                                the target time, so the board never shows an
                                outturn that a buyer could not have had.
                            </li>
                        </ul>
                    </div>
                </Panel>

                <Panel title="Limitations">
                    <div className="prose">
                        <ul>
                            <li>
                                <strong>Wind only.</strong> The brief scopes the
                                pilot to national wind, so the app sizes the
                                wind side of the balance only. The residual
                                thermal requirement is the desk&rsquo;s own
                                demand input; the app deliberately does not
                                model demand, prices or other fuels.
                            </li>
                            <li>
                                <strong>One month of decisions.</strong> The
                                error distribution is calibrated on January 2026
                                — a winter month with high wind variability. A
                                seasonal recalibration is needed before the band
                                is used in other months.
                            </li>
                            <li>
                                <strong>In-sample band.</strong> The band for a
                                given day is calibrated on the same window it is
                                applied to, so it is a description of
                                January&rsquo;s measured behaviour rather than a
                                forecast of it.
                            </li>
                            <li>
                                <strong>Hourly forecast resolution.</strong> A
                                30-minute settlement ramp cannot be observed in
                                an hourly forecast; the settlement-period view
                                is indicative.
                            </li>
                        </ul>
                    </div>
                </Panel>
            </div>

            <Panel
                title="Data lineage"
                note="every ingestion run recorded in the store"
                flush
            >
                <div className="table-scroll">
                    <table className="dtable">
                        <thead>
                            <tr>
                                <th>Run</th>
                                <th>Dataset</th>
                                <th>Query</th>
                                <th className="num">Rows fetched</th>
                                <th className="num">Rows written</th>
                                <th>Finished</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(runs.data ?? []).map((run) => (
                                <tr key={run.id}>
                                    <td>{run.id}</td>
                                    <td>{run.dataset}</td>
                                    <td
                                        style={{
                                            whiteSpace: "normal",
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        {run.query}
                                    </td>
                                    <td className="num">
                                        {run.rows_fetched.toLocaleString()}
                                    </td>
                                    <td className="num">
                                        {run.rows_written.toLocaleString()}
                                    </td>
                                    <td>
                                        {run.finished_at
                                            ? fmtDateTime(`${run.finished_at}Z`)
                                            : "—"}
                                    </td>
                                    <td>{run.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </>
    );
}
