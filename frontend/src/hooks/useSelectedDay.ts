import { useSearchParams } from "react-router-dom";

export const DEFAULT_DELIVERY_DAY = "2026-01-06";

/** The delivery day is kept in the URL so any view can be linked to. */
export function useSelectedDay(defaultDay: string = DEFAULT_DELIVERY_DAY) {
    const [params, setParams] = useSearchParams();
    const day = params.get("day") ?? defaultDay;
    const setDay = (next: string) => {
        const updated = new URLSearchParams(params);
        updated.set("day", next);
        setParams(updated, { replace: true });
    };
    return { day, setDay };
}
