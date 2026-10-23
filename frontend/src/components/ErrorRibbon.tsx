import { errorColor } from "./ui";

export interface RibbonDay {
    delivery_date: string;
    cells: number[];
    meanError: number;
    maxAbs: number;
}

/**
 * The error ribbon: one row per delivery day, one cell per settlement period,
 * coloured by the signed forecast error at gate closure.  It is the fastest
 * way for a buyer to see where the forecast failed across a whole month.
 */
export function ErrorRibbon({
    days,
    maxAbs,
    onSelect,
    selected,
}: {
    days: RibbonDay[];
    maxAbs: number;
    onSelect?: (date: string) => void;
    selected?: string;
}) {
    if (!days.length) {
        return (
            <div className="note">
                No settlement-period errors in this window.
            </div>
        );
    }
    return (
        <div className="ribbon">
            {days.map((day) => (
                <div className="ribbon__row" key={day.delivery_date}>
                    <span className="ribbon__label">
                        {day.delivery_date.slice(8, 10)}
                        <span
                            style={{
                                color:
                                    day.maxAbs > 0
                                        ? "var(--rust)"
                                        : "var(--pine)",
                            }}
                        >
                            {" "}
                            {day.meanError > 0 ? "+" : ""}
                            {Math.round(day.meanError)}
                        </span>
                    </span>
                    <div className="ribbon__cells">
                        {day.cells.map((value, index) => (
                            <span
                                key={index}
                                className="ribbon__cell"
                                title={`${day.delivery_date} SP${index + 1} · error ${value > 0 ? "+" : ""}${Math.round(value)} MW`}
                                style={{
                                    background: errorColor(value, maxAbs),
                                    outline:
                                        selected === day.delivery_date
                                            ? "1px solid var(--sea)"
                                            : undefined,
                                    cursor: onSelect ? "pointer" : undefined,
                                }}
                                onClick={
                                    onSelect
                                        ? () => onSelect(day.delivery_date)
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div className="ribbon__scale">
                <span>surplus {maxAbs ? `−${Math.round(maxAbs)} MW` : ""}</span>
                <span className="ribbon__ramp" />
                <span>
                    {maxAbs ? `+${Math.round(maxAbs)} MW` : ""} shortfall
                </span>
                <span style={{ marginLeft: "auto" }}>
                    48 settlement periods per row · gate-closure forecast
                </span>
            </div>
        </div>
    );
}
