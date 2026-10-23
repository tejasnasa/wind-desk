/** Response shapes returned by the Wind Desk API. */

export interface Envelope<T> {
    data: T;
    meta: { generated_at: string; n?: number };
}

export interface Coverage {
    actuals: { from: string | null; to: string | null; rows: number };
    forecasts: {
        publish_from: string | null;
        publish_to: string | null;
        target_from: string | null;
        target_to: string | null;
        rows: number;
        publications: number;
    };
}

export interface Meta {
    product: string;
    data_source: {
        name: string;
        base_url: string;
        actuals_dataset: string;
        forecast_dataset: string;
        note: string;
    };
    market_rules: {
        gate_closure_local: string;
        timezone: string;
        delivery_day_basis: string;
        forecast_grid: string;
        actual_grid: string;
    };
    coverage: Coverage;
    delivery_dates: { from: string | null; to: string | null; count: number };
    publication_cadence_local: Record<string, number>;
    analysis_window: { from: string; to: string };
    generated_at: string;
}

export interface DataRun {
    id: number;
    dataset: string;
    query: string;
    started_at: string | null;
    finished_at: string | null;
    rows_fetched: number;
    rows_written: number;
    status: string;
    message: string | null;
}

export interface PublishSelection {
    publish_time: string | null;
    cutoff: string;
    available_publishes: string[];
    covered_hours: number;
    expected_hours: number;
    coverage_ratio: number;
    complete: boolean;
    note: string | null;
}

export interface HourPoint {
    target_time: string;
    local_hour: string;
    forecast_mw: number | null;
    actual_mw: number | null;
    error_mw: number | null;
    band_lower_mw: number | null;
    band_upper_mw: number | null;
}

export interface SettlementPoint {
    settlement_period: number;
    target_time: string;
    local_time: string;
    forecast_mw: number | null;
    actual_mw: number | null;
    error_mw: number | null;
}

export interface TimelineEntry {
    publish_time: string;
    publish_local: string;
    covered_hours: number;
    complete: boolean;
    mae_mw: number;
    bias_mw: number;
    rmse_mw: number;
    forecast_energy_mwh: number;
    actual_energy_mwh: number;
    error_mwh: number;
    hours_before_cutoff: number;
}

export interface BandEnergy {
    band_mw: number;
    band_mwh: number;
    downside_mw: number;
    downside_mwh: number;
    upside_mw: number;
    upside_mwh: number;
}

export interface Bands {
    n: number;
    confidence_levels: number[];
    flat_mw: Record<string, number>;
    downside_mw: Record<string, number>;
    upside_mw: Record<string, number>;
    relative_pct: Record<string, number>;
    planning_mw: Record<string, number>;
    mean_actual_mw: number;
    energy: Record<string, BandEnergy>;
    reference: string;
}

export interface DecisionView {
    delivery_date: string;
    cutoff: string;
    cutoff_local: string;
    gate_closure_local: string;
    selected_publish: PublishSelection;
    coverage: {
        forecast_hours: number;
        expected_hours: number;
        actual_hours: number;
    };
    daily: {
        forecast_energy_mwh: number;
        actual_energy_mwh: number;
        error_mwh: number;
        error_pct: number | null;
        mae_mw: number;
        rmse_mw: number;
        bias_mw: number;
        nmae_pct: number;
        n: number;
        mean_actual_mw: number;
        mean_forecast_mw: number;
    };
    bands: Bands;
    hourly_series: HourPoint[];
    settlement_series: SettlementPoint[];
    timeline: TimelineEntry[];
}

export interface HeadlineMetrics {
    mae_mw: number;
    rmse_mw: number;
    bias_mw: number;
    nmae_pct: number;
    mape_pct: number;
    smape_pct: number;
    correlation: number;
    n: number;
    mean_actual_mw: number;
    mean_forecast_mw: number;
    error_std_mw: number;
}

export interface AccuracySummary {
    window: { from: string; to: string };
    delivery_days: number;
    headline: HeadlineMetrics;
    abs_error_quantiles_mw: Record<string, number>;
    signed_error_quantiles_mw: Record<string, number>;
    energy_error: {
        mae_mwh: number;
        rmse_mwh: number;
        bias_mwh: number;
        mean_absolute_pct: number;
    };
    bands: Bands;
}

export interface SeriesRow {
    delivery_date: string;
    n: number;
    mae_mw: number;
    rmse_mw: number;
    bias_mw: number;
    nmae_pct: number;
    forecast_energy_mwh: number;
    actual_energy_mwh: number;
    error_mwh: number;
    error_pct: number;
    mean_actual_mw: number;
    mean_forecast_mw: number;
    bias_pct: number;
}

export interface BucketRow {
    key: string;
    n: number;
    mae_mw: number;
    rmse_mw: number;
    bias_mw: number;
    nmae_pct: number;
    mape_pct: number;
    smape_pct: number;
    correlation: number;
    mean_actual_mw: number;
    mean_forecast_mw: number;
    error_std_mw: number;
}

export interface LeadTimeResponse {
    window: { from: string; to: string };
    buckets: BucketRow[];
}

export interface DistributionResponse {
    window: { from: string; to: string };
    histogram: {
        bins: { from: number; to: number; mid: number; count: number }[];
        count: number;
        min: number;
        max: number;
    };
    signed_error_quantiles_mw: Record<string, number>;
    abs_error_quantiles_mw: Record<string, number>;
    share_under_forecast_pct: number;
}

export interface HeatmapResponse {
    days: string[];
    hours: number[];
    matrix: (number | null)[][];
}

export interface BaselinesResponse {
    window: { from: string; to: string };
    baseline: string;
    skill: { skill_score_pct: number; mae_mw: number; baseline_mae_mw: number };
    forecast_stats: HeadlineMetrics;
    baseline_stats: HeadlineMetrics;
}

export interface RibbonRow {
    delivery_date: string;
    settlement_period: number;
    local_time: string;
    forecast_mw: number;
    actual_mw: number;
    error_mw: number;
}
