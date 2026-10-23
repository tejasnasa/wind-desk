# Demo video — script, storyboard and recording checklist

The brief asks for **one unlisted YouTube video** with two parts, each with a maximum
5-minute overview, and a total limit of 10 minutes. This folder holds the production
material:

| File | Part | Length target |
|---|---|---|
| [`part1-client-pitch.md`](part1-client-pitch.md) | 1 — client pitch (the pilot outcome) | 4:30 – 5:00 |
| [`part2-technical-review.md`](part2-technical-review.md) | 2 — technical review (architecture, design, code, practices) | 4:30 – 5:00 |

Both scripts are written to be read aloud; the timings are realistic, not aspirational.

---

## Recording checklist

1. **Start the stack** so the URLs are live while recording:

   ```bash
   docker compose up --build      # http://localhost:8080
   # or, for the deployed version, open the Vercel/Heroku URL
   ```

2. **Browser setup** before recording:
   - window size 1600×1000 (or 1920×1080 scaled to 1600 for crisper text),
   - zoom 100 %, hide bookmarks bar,
   - dark-reader/reader-mode extensions **off** (they change the colours),
   - if narrating, disable notifications and set the "Do Not Disturb" flag.

3. **Capture at 1920×1080 / 30 fps** with narration. Keep the app full-screen; scroll
   slowly, one idea per screen.

4. **Upload as unlisted** (not public, not private):

   ```
   YouTube → Studio → Upload → Visibility: Unlisted → Copy link
   ```

   Then open the unlisted link **in an incognito window** to confirm it is reachable
   without a Google account — the submission form asks for exactly that check.

5. **Verify every URL in the submission form in incognito mode**: the repository, the live
   app and the video.

---

## Shot list (both parts reuse these)

| # | Scene | URL | Why it is in the video |
|---|---|---|---|
| S1 | Overview — headline tiles | `/` | The commercial answer in one screen |
| S2 | Delivery-day profile + band | `/` | "What did we know at gate closure?" |
| S3 | Daily energy error chart | `/` | The size of the systematic over-forecast |
| S4 | Error ribbon | `/` | The signature view: the month at a glance |
| S5 | Decision board — vintage, profile, outturn | `/decision?day=2026-01-06` | The decision itself |
| S6 | Decision board — information timeline | `/decision?day=2026-01-06` | How the forecast evolved before the auction |
| S7 | Decision board — procurement risk band | `/decision?day=2026-01-06` | The quantified buffer |
| S8 | Decision board — settlement periods | `/decision?day=2026-01-06` | Half-hourly detail |
| S9 | Day strip navigation | `/decision?day=2026-01-12` | It is a working product, not a mock-up |
| S10 | Accuracy — distribution | `/accuracy` | The error distribution |
| S11 | Accuracy — lead time | `/accuracy` | Why the vintage we picked is the right one |
| S12 | Accuracy — hour of day / weekday | `/accuracy` | Systematic structure in the error |
| S13 | Accuracy — skill vs baseline | `/accuracy` | Proof the forecast adds value |
| S14 | Accuracy — daily detail + CSV | `/accuracy` | It is auditable and exportable |
| S15 | Methodology — sources and decision rule | `/methodology` | Trust: here is the rule, here is the API |
| S16 | Methodology — data lineage table | `/methodology` | Provenance for every number |

---

## Recording tips for a technical-lead audience

* Part 1 is a **business** story: lead with the decision, not the data source.
* Part 2 is a **review** story: name the interesting problems (the retired API, the
  hourly-vs-half-hourly grid, the publication cadence) and show how they were handled.
* If the reviewer interrupts with a question, the screen state that answers it is usually
  one click away — the scripts mark those moments with **[ALT]**.
