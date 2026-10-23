# Part 1 — Client pitch (pilot outcome)

**Rendered length:** 4:17 · **Audience:** the client — the head of day-ahead power purchasing
and their risk lead. **Tone:** a pilot delivery conversation: here is what we built, here
is what it says about your January book, here is what I would do next.

> The timings below are the ones in the rendered video
> (`tools/video/out/wind-desk-part1-client-pitch.mp4`). The narration for every scene
> lives in [`../../tools/video/script.json`](../../tools/video/script.json), which is what
> the build actually reads.

---

## Scene 1 — Title (0:00 – 0:10)

**Screen:** title card — the wordmark, the three headline numbers, the data source.

> "This is Wind Desk, a pilot for the day-ahead wind position, built from Elexon's own
> public data for the January 2026 decisions."

---

## Scene 2 — The problem (0:10 – 0:40)

**Screen:** Overview, the headline tiles (S1).

> "Every morning at eleven, the auction closes and you commit to a position for tomorrow.
> The input you cannot control is the wind, and the only forecast you may buy against is
> the one published before that cut-off.
>
> So two questions decide your morning: what did we actually know at eleven, and how
> wrong has that forecast been when we look back?
>
> Everything you will see is computed from Elexon's public data."

---

## Scene 3 — What the tool says about January (0:40 – 1:05)

**Screen:** the five headline tiles (S1).

> "Here is the headline. The forecast you buy against is, on average, one thousand eight
> hundred and forty megawatts too high. About sixteen per cent more wind promised than
> delivered.
>
> That is not noise. That is a systematic bias, and it means a desk covering purely for
> the published forecast is quietly short every day."

---

## Scene 4 — The size of the miss (1:05 – 1:34)

**Screen:** delivery-day profile with the P95 band (S2).

> "The typical miss is two thousand one hundred and twenty-three megawatts. The
> ninety-fifth percentile band, the worst one in twenty periods, is five thousand five
> hundred and eighty-four.
>
> That is a hundred and thirty-four gigawatt hours in a single day.
>
> That last number is the one I would take to your risk committee: what a one in twenty
> shortfall costs you, per day, in energy."

---

## Scene 5 — The decision, as the desk would have seen it (1:34 – 2:14)

**Screen:** Decision board for 6 January (S5), then the profile chart.

> "Here is the core of the tool. Pick a delivery day and it shows the exact forecast
> vintage that existed before the cut-off, here the nine-thirty publication on the fifth,
> with the settled outturn underneath.
>
> Two things to notice. The shape of the day is well captured; the forecast tracks the
> outturn closely. The level is not: it sits above the actual for most of the day. Shape
> good, level biased.
>
> And the shaded band is not a guess. It is January's measured error distribution,
> applied to this forecast."

---

## Scene 6 — How the information evolved (2:14 – 2:41)

**Screen:** the information timeline (S6).

> "Before we commit, ask: when did we know this? The timeline shows every publication that
> existed before the cut-off, and how wrong each one would have been.
>
> The eleven-thirty publication is not on the chart, because it lands half an hour after
> the auction closes. You cannot buy with it. The tool enforces that rule rather than
> leaving it to discipline."

---

## Scene 7 — Sizing the cover (2:41 – 3:12)

**Screen:** procurement risk band panel (S7), then the settlement-period table (S8).

> "This is the operational output. With the forecast and a measured band, the residual
> requirement is covered up to forecast minus band in the downside case: roughly one
> thousand one hundred and forty-six megawatts of extra thermal for a one in twenty
> shortfall.
>
> Below is the half-hourly view: every settlement period, the forecast, the outturn and
> the direction of the error, so you can see which hours the forecast was carrying the
> book."

---

## Scene 8 — The month, at a glance (3:12 – 3:31)

**Screen:** the error ribbon on the Accuracy page (S13).

> "Zoom out to the month. Every settlement period of January, coloured by error: rust
> means wind was under-delivered, green means it over-delivered.
>
> You can see the whole month's bias at a glance, and the days where it flipped."

---

## Scene 9 — The proof (3:31 – 3:47)

**Screen:** forecast skill versus a naive baseline (S12).

> "One more thing, because a forecast has to earn its place: against the naive assumption
> of carrying yesterday's outturn forward, the published forecast is forty-six per cent
> better. It is worth buying."

---

## Scene 10 — Close and next step (3:47 – 4:17)

**Screen:** the "Next phase" card.

> "Three things I would take to the next phase. Calibrate the band on a rolling
> out-of-sample window rather than the month itself. Extend the same treatment to your
> other renewables and the interconnector. And wire the residual requirement into your
> demand forecast, so the output becomes a purchase quantity.
>
> The pilot is deliberately wind-only and January-only. That was the scope. The method
> does not change when we widen it."

---

**Total: 4:17** — inside the brief's five-minute limit for Part 1.
