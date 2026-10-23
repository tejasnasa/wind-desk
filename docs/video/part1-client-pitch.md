# Part 1 — Client pitch (pilot outcome)

**Target length:** 4:45 · **Audience:** the client — the head of day-ahead power purchasing
and their risk lead. **Tone:** a pilot delivery conversation: here is what we built, here
is what it says about your January book, here is what I would do next.

---

## Scene 1 — The problem (0:00 – 0:35)

**Screen:** black card, then the Overview page as it loads.

> "Every morning at eleven, the day-ahead auction closes and you commit to a position for
> tomorrow. The one input you cannot control is the wind — and the only wind forecast you
> are allowed to use is the one published before that cut-off.
>
> So two questions decide your morning: *what did we actually know at eleven*, and *how
> wrong has that forecast been when we've looked back?*
>
> We built a pilot for exactly that. Everything you're about to see is computed from
> Elexon's own public data — the January 2026 decisions."

**[ALT]** If asked "is this live?": the data is real and refreshable; the pilot is scoped to
January 2026 decisions, as agreed.

---

## Scene 2 — What the tool says about January (0:35 – 1:45)

**Screen:** Overview, the five headline tiles (S1). Slow pan left to right.

> "Here is the headline. The wind forecast you buy against is, on average, **1,840 MW
> too high** — about sixteen per cent more wind promised than delivered. That is not
> noise; that is a systematic bias, and it means a desk that covers purely for the
> published forecast is quietly short every day.
>
> The typical miss is **2,123 MW**. The P95 band — the worst one-in-twenty periods — is
> **5,584 MW**, which is **134 gigawatt-hours over a day**.
>
> That last number is the one I would put in front of your risk committee: *this is the
> buffer a one-in-twenty wind shortfall costs you, per day, in energy.*"

---

## Scene 3 — The decision, as the desk would have seen it (1:45 – 2:40)

**Screen:** Decision board for 6 January (S5), then the profile chart.

> "Here is the tool's core. Pick a delivery day, and it shows the exact forecast vintage
> that existed before the eleven o'clock cut-off — here, the 09:30 publication on the
> fifth — with the settled outturn underneath it.
>
> Two things to notice. First, the shape of the day is well captured: the forecast tracks
> the outturn closely. Second, the level is not: the forecast sits above the actual for
> most of the day. Shape good, level biased.
>
> And the shaded band is not a guess — it is the measured error distribution for January,
> applied to this forecast."

---

## Scene 4 — How the information evolved (2:40 – 3:15)

**Screen:** the information timeline on the decision board (S6).

> "Before we commit, ask: *when did we know this?* This timeline shows every publication
> that existed before the cut-off, and how wrong each one would have been.
>
> The eleven-thirty publication is not on this chart — because it lands half an hour after
> the auction has closed. You cannot buy with it. The tool enforces that rule rather than
> leaving it to discipline."

---

## Scene 5 — Sizing the cover (3:15 – 4:00)

**Screen:** procurement risk band panel (S7), then the settlement-period table (S8).

> "This is the operational output. With the forecast and a measured band, your residual
> requirement is covered up to *forecast minus band* in the downside case: on a January
> day, roughly 1,146 megawatts of extra thermal for a one-in-twenty wind shortfall.
>
> And below it, the half-hourly view — every settlement period, the forecast, the
> outturn, and the direction of the error, so you can see exactly which hours the forecast
> was carrying the book."

---

## Scene 6 — The month, and the proof (4:00 – 4:35)

**Screen:** the error ribbon (S4), then the skill score on the Accuracy page (S13).

> "Zoom out to the month. This is every settlement period of January, coloured by the
> error: rust means wind was under-delivered, green means it over-delivered. You can see
> the whole month's bias in one glance, and the days where it flipped.
>
> One more thing, because a forecast has to earn its place: against the naive assumption
> of carrying yesterday's outturn forward, the published forecast is **46 per cent better**.
> It is worth buying."

---

## Scene 7 — Close and next step (4:35 – 4:55)

**Screen:** back to Overview.

> "Three things I would take to the next phase. One: calibrate the band on a rolling
> out-of-sample window rather than the month itself. Two: extend the same treatment to
> your other renewables and the interconnector position. Three: wire the residual
> requirement into your own demand forecast, so the output becomes a purchase quantity
> rather than a wind position.
>
> The pilot is deliberately wind-only and January-only — that was the scope. The method
> does not change when we widen it."

---

**Total: ≈ 4:55.** Keep Part 1 under five minutes: if you overrun, cut Scene 4 to two
sentences and drop the day-strip navigation.
