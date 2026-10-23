import type { SeriesRow } from "../api/types";
import { errorColor } from "./ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Delivery-day selector.  Each cell carries a bar whose length and colour
 * encode the day's energy error, so the strip doubles as an at-a-glance
 * month view.
 */
export function DayStrip({
    series,
    selected,
    onSelect,
}: {
    series: SeriesRow[];
    selected: string;
    onSelect: (date: string) => void;
}) {
    const maxAbs = Math.max(...series.map((row) => Math.abs(row.error_mwh)), 1);
    return (
        <div className="daystrip" role="tablist" aria-label="Delivery day">
            {series.map((row) => {
                const width = (Math.abs(row.error_mwh) / maxAbs) * 100;
                const isShortfall = row.error_mwh > 0;
                return (
                    <button
                        key={row.delivery_date}
                        role="tab"
                        aria-selected={row.delivery_date === selected}
                        className={`daystrip__day${row.delivery_date === selected ? " is-selected" : ""}`}
                        onClick={() => onSelect(row.delivery_date)}
                        title={`${row.delivery_date} · error ${row.error_mwh > 0 ? "+" : ""}${Math.round(row.error_mwh)} MWh (${row.error_pct.toFixed(1)}%)`}
                    >
                        <span className="daystrip__dow">
                            {
                                DOW[
                                    new Date(
                                        `${row.delivery_date}T12:00:00Z`,
                                    ).getUTCDay()
                                ]
                            }
                        </span>
                        <span>{row.delivery_date.slice(8, 10)}</span>
                        <span className="daystrip__bar">
                            <i
                                style={{
                                    width: `${width}%`,
                                    left: isShortfall ? "50%" : undefined,
                                    right: isShortfall ? undefined : "50%",
                                    background: errorColor(
                                        row.error_mwh,
                                        maxAbs,
                                    ),
                                }}
                            />
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
