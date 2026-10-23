# Demo video — script, rendered output and how to rebuild it

The brief asks for **one unlisted YouTube video** with two parts, each with a maximum
5-minute overview, and a total limit of 10 minutes. This folder holds the production
material and the rendered file.

| File                                                     | Part                                                         | Length |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| [`part1-client-pitch.md`](part1-client-pitch.md)         | 1 — client pitch (the pilot outcome)                         | 4:17   |
| [`part2-technical-review.md`](part2-technical-review.md) | 2 — technical review (architecture, design, code, practices) | 4:59   |
| `../../tools/video/out/wind-desk-demo.mp4`               | the whole video                                              | 9:16   |

Both parts are inside the brief's limits, and the total is under 10 minutes.

---

## The video is rendered, not screen-recorded by hand

`tools/video/` contains a small production pipeline that renders the whole thing
deterministically, so it can be rebuilt after any change to the app or the script:

| Step | Script        | What it does                                                               |
| ---- | ------------- | -------------------------------------------------------------------------- |
| 1    | `flatten.mjs` | flattens `script.json` into one narration line per entry                   |
| 2    | `tts.ps1`     | synthesises each line with the Windows SAPI voice (no network, no API key) |
| 3    | `build.mjs`   | measures each clip, computes the scene/line timeline                       |
| 4    | `cards.mjs`   | renders the Part 1 / Part 2 slides to 1920×1080 PNGs                       |
| 5    | `record.mjs`  | drives the running app in headless Edge and records the app segments       |
| 6    | `build.mjs`   | assembles clips, narration, captions and the final MP4 with ffmpeg         |

The narration in `script.json` is the single source of truth for both the voice-over and
the burned-in captions, and each line is timed from the _measured_ length of its own
synthesised audio — so the captions cannot drift from the speech.

The app segments are recorded against that timeline: a step like
`{ "do": "scroll", "to": "panel:Information timeline", "atLine": "p1-06-l1" }` scrolls
the page at the moment the sentence that describes it begins.

### Rebuilding

```bash
docker compose up --build -d          # the app must be running
npm --prefix tools/video install      # playwright-core (drives the installed Edge)
node tools/video/build.mjs http://127.0.0.1:8080
```

Output lands in `tools/video/out/`:

- `wind-desk-demo.mp4` — the full 9:16 video
- `wind-desk-part1-client-pitch.mp4` — Part 1 only (4:17)
- `wind-desk-part2-technical-review.mp4` — Part 2 only (4:59)

Everything is cached by content hash, so re-running after a small edit only redoes the
parts that actually changed.

> The rendered MP4s are **not committed** (67 MB). They are build artefacts — regenerate
> them with the command above, or take the file straight from `tools/video/out/` to
> upload.

---

## Uploading

1. **Upload as unlisted** (not public, not private):

   ```
   YouTube → Studio → Upload → Visibility: Unlisted → Copy link
   ```

2. Open the unlisted link **in an incognito window** to confirm it is reachable without a
   Google account — the submission form asks for exactly that check.

3. **Verify every URL in the submission form in incognito mode**: the repository, the live
   app and the video.

---

## Shot list (both parts reuse these)

| #   | Scene                                      | URL                        | Why it is in the video                       |
| --- | ------------------------------------------ | -------------------------- | -------------------------------------------- |
| S1  | Overview — headline tiles                  | `/`                        | The commercial answer in one screen          |
| S2  | Delivery-day profile + band                | `/`                        | "What did we know at gate closure?"          |
| S3  | Daily energy error chart                   | `/`                        | The size of the systematic over-forecast     |
| S4  | Error ribbon                               | `/`                        | The signature view: the month at a glance    |
| S5  | Decision board — vintage, profile, outturn | `/decision?day=2026-01-06` | The decision itself                          |
| S6  | Decision board — information timeline      | `/decision?day=2026-01-06` | How the forecast evolved before the auction  |
| S7  | Decision board — procurement risk band     | `/decision?day=2026-01-06` | The quantified buffer                        |
| S8  | Decision board — settlement periods        | `/decision?day=2026-01-06` | Half-hourly detail                           |
| S9  | Accuracy — distribution                    | `/accuracy`                | The error distribution                       |
| S10 | Accuracy — lead time                       | `/accuracy`                | Why the vintage we picked is the right one   |
| S11 | Accuracy — hour of day / weekday           | `/accuracy`                | Systematic structure in the error            |
| S12 | Accuracy — skill vs baseline               | `/accuracy`                | Proof the forecast adds value                |
| S13 | Accuracy — settlement-period ribbon        | `/accuracy`                | The month at a glance, coloured by direction |

---

## Recording tips for a technical-lead audience

- Part 1 is a **business** story: lead with the decision, not the data source.
- Part 2 is a **review** story: name the interesting problems (the retired API, the
  hourly-vs-half-hourly grid, the publication cadence) and show how they were handled.
- If the reviewer interrupts with a question, the screen state that answers it is usually
  one click away — the scripts mark those moments with **[ALT]**.
