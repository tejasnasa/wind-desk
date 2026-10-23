/**
 * Build the demo video.
 *
 * Pipeline:
 *   1. flatten the script into narration lines
 *   2. synthesise the narration with the Windows SAPI voice (no network)
 *   3. measure each clip and compute the scene/line timeline
 *   4. render the slide cards
 *   5. record the app segments against that timeline
 *   6. assemble: clips -> narration track -> burned-in captions -> MP4
 *
 *   node tools/video/build.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, "work");
const clipsDir = join(work, "clips");
const outDir = join(here, "out");
mkdirSync(work, { recursive: true });
mkdirSync(clipsDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const script = JSON.parse(readFileSync(join(here, "script.json"), "utf8"));
const meta = script.meta;

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });

const probe = (file) =>
  Number(
    sh("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).trim(),
  );

const log = (msg) => console.log(msg);

/* ---------------------------------------------------------- 1 + 2 + 3 -- */

log("· narration");
sh("node", [join(here, "flatten.mjs")]);

const lines = JSON.parse(readFileSync(join(work, "lines.json"), "utf8"));
const ttsDir = join(work, "tts");
const manifestPath = join(ttsDir, "manifest.json");
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};
const digest = (text) =>
  createHash("sha1").update(text).digest("hex").slice(0, 12);

const stale = lines.filter(
  (l) =>
    !existsSync(join(ttsDir, `${l.id}.wav`)) ||
    manifest[l.id] !== digest(l.text),
);
if (stale.length) {
  log(`  re-synthesising ${stale.length} line(s)`);
  for (const line of stale) {
    const out = join(ttsDir, `${line.id}.wav`);
    if (existsSync(out)) rmSync(out);
  }
  writeFileSync(join(work, "stale.json"), JSON.stringify(stale, null, 2));
  sh("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(here, "tts.ps1"),
    "-LinesFile",
    join(work, "stale.json"),
    "-OutDir",
    ttsDir,
    "-Voice",
    meta.voice,
    "-Rate",
    String(meta.rate),
  ]);
  const next = { ...manifest };
  for (const line of lines) next[line.id] = digest(line.text);
  writeFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
}

const durations = {};
for (const line of lines) {
  durations[line.id] = probe(join(ttsDir, `${line.id}.wav`));
}

/* timeline: scene boundaries, line placements */
let clock = 0;
const scenes = [];
for (const scene of script.scenes) {
  const leadIn = scene.kind === "app" ? meta.appLeadIn : meta.leadIn;
  let cursor = leadIn;
  const placed = scene.lines.map((line) => {
    const start = cursor;
    cursor += durations[line.id] + meta.gap;
    return { ...line, start, end: start + durations[line.id] };
  });
  const lastEnd = placed.length ? placed[placed.length - 1].end : leadIn;
  const duration = Math.max(lastEnd + meta.tail, leadIn + meta.tail);
  scenes.push({
    ...scene,
    leadIn,
    duration,
    start: clock,
    lines: placed,
  });
  clock += duration;
}
const total = clock;
writeFileSync(
  join(work, "timeline.json"),
  JSON.stringify({ scenes, total }, null, 2) + "\n",
);

const partDuration = (part) =>
  scenes.filter((s) => s.part === part).reduce((n, s) => n + s.duration, 0);
log(
  `  part 1 ${fmt(partDuration(1))} · part 2 ${fmt(partDuration(2))} · total ${fmt(total)}`,
);
if (total > 600) {
  log("  WARNING: over the 10 minute cap");
}
for (const part of [1, 2]) {
  const d = partDuration(part);
  if (d > 300) log(`  WARNING: part ${part} is over 5 minutes`);
}
if (process.env.VIDEO_TIMELINE_ONLY === "1") {
  log("  (timeline only)");
  process.exit(0);
}

/* --------------------------------------------------------------- 4 + 5 -- */

log("· cards");
sh("node", [join(here, "cards.mjs")]);

log("· app segments");
const recPath = join(work, "recordings.json");
const reuseRecord =
  process.env.VIDEO_SKIP_RECORD === "1" &&
  existsSync(recPath) &&
  JSON.parse(readFileSync(recPath, "utf8")).every((r) => existsSync(r.file));
if (reuseRecord) {
  log("  (reusing the previous recording)");
} else {
  sh("node", [join(here, "record.mjs"), BASE]);
}
const recordings = JSON.parse(readFileSync(recPath, "utf8"));

/* ------------------------------------------------------- 6a: video clips */

const timelineHash = createHash("sha1")
  .update(
    JSON.stringify(
      scenes.map((s) => [
        s.id,
        s.duration.toFixed(3),
        s.lines.map((l) => `${l.id}@${l.start.toFixed(3)}`),
      ]),
    ),
  )
  .digest("hex")
  .slice(0, 12);
const clipsManifestPath = join(clipsDir, "manifest.json");
const clipsManifest = existsSync(clipsManifestPath)
  ? JSON.parse(readFileSync(clipsManifestPath, "utf8"))
  : {};

log("· scene clips");
const clipFiles = [];
for (const scene of scenes) {
  const out = join(clipsDir, `${scene.id}.mp4`);
  clipFiles.push(out);

  // The cache key covers both the timeline and the recording, so a change to
  // either one invalidates the clip.
  const sourceHash =
    scene.kind === "app"
      ? (recordings.find((r) => r.id === scene.id)?.hash ?? "none")
      : "card";
  const clipKey = `${timelineHash}:${sourceHash}`;

  const cached =
    clipsManifest[scene.id] === clipKey &&
    existsSync(out) &&
    Math.abs(probe(out) - scene.duration) < 0.25;
  if (cached) {
    log(`  ${scene.id}  ${scene.duration.toFixed(2)}s  (cached)`);
    continue;
  }

  if (scene.kind === "app") {
    const rec = recordings.find((r) => r.id === scene.id);
    const rawDur = probe(rec.file);
    const usable = rawDur - rec.offset;
    const pad = Math.max(0, scene.duration - usable);
    const vf = [
      "scale=1920:1080:force_original_aspect_ratio=decrease",
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xeef1f4",
      pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : null,
      "fps=30",
      "format=yuv420p",
    ]
      .filter(Boolean)
      .join(",");
    sh("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(rec.offset),
      "-i",
      rec.file,
      "-t",
      scene.duration.toFixed(3),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-an",
      out,
    ]);
  } else {
    const fade = Math.min(0.35, scene.duration / 4);
    // A slow, centred push-in so a long static slide still breathes.
    const rate = (0.045 / (scene.duration * 30)).toFixed(7);
    const vf = [
      "scale=3840:2160:flags=lanczos",
      `zoompan=z='min(1+${rate}*on,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30`,
      `fade=t=in:st=0:d=${fade}`,
      `fade=t=out:st=${(scene.duration - fade).toFixed(3)}:d=${fade}`,
      "format=yuv420p",
    ].join(",");
    sh("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-loop",
      "1",
      "-i",
      join(work, "cards", `${scene.id}.png`),
      "-t",
      scene.duration.toFixed(3),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-an",
      out,
    ]);
  }
  log(`  ${scene.id}  ${scene.duration.toFixed(2)}s`);
}
writeFileSync(
  clipsManifestPath,
  JSON.stringify(
    Object.fromEntries(
      scenes.map((s) => [
        s.id,
        `${timelineHash}:${
          s.kind === "app"
            ? (recordings.find((r) => r.id === s.id)?.hash ?? "none")
            : "card"
        }`,
      ]),
    ),
    null,
    2,
  ) + "\n",
);

/* --------------------------------------------------------- 6b: narration */

log("· narration track");
const narrationWav = join(work, "narration.wav");
buildNarration(scenes, ttsDir, narrationWav, meta);

/* ----------------------------------------------------------- 6c: captions */

log("· captions");
const assPath = join(work, "captions.ass");
writeFileSync(assPath, buildAss(scenes));

/* ------------------------------------------------------------- 6d: mux -- */

log("· mux");
const silentVideo = join(work, "video.mp4");
writeFileSync(
  join(clipsDir, "list.txt"),
  clipFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n") + "\n",
);
sh("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  join(clipsDir, "list.txt"),
  "-c",
  "copy",
  silentVideo,
]);

const finalVideo = join(outDir, "wind-desk-demo.mp4");
// A Windows drive colon has to be escaped for the ffmpeg filter parser.
const assFilter = `subtitles=filename='${assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")}'`;
sh("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  silentVideo,
  "-i",
  narrationWav,
  "-vf",
  assFilter,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-ar",
  "44100",
  "-movflags",
  "+faststart",
  "-shortest",
  finalVideo,
]);

/* split into the two parts the brief asks for */
const p1 = scenes.filter((s) => s.part === 1);
const p2 = scenes.filter((s) => s.part === 2);
const p1Start = p1[0].start;
const p1End = p1[p1.length - 1].start + p1[p1.length - 1].duration;
const p2Start = p2[0].start;
const p2End = p2[p2.length - 1].start + p2[p2.length - 1].duration;

for (const [name, from, to] of [
  ["wind-desk-part1-client-pitch.mp4", p1Start, p1End],
  ["wind-desk-part2-technical-review.mp4", p2Start, p2End],
]) {
  sh("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-ss",
    from.toFixed(3),
    "-to",
    to.toFixed(3),
    "-i",
    finalVideo,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    join(outDir, name),
  ]);
}

const finalDur = probe(finalVideo);
log("");
log(`  ${finalVideo}  ${fmt(finalDur)}  ${(finalDur / 60).toFixed(2)} min`);
log(`  part 1 ${fmt(p1End - p1Start)}   part 2 ${fmt(p2End - p2Start)}`);

/* ------------------------------------------------------------- helpers -- */

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Concatenate silence and speech clips into one narration track. */
function buildNarration(scenes, ttsDir, outPath, m) {
  const first = readWav(join(ttsDir, `${scenes[0].lines[0].id}.wav`));
  const { sampleRate, channels, bitsPerSample } = first;
  const bytesPerSample = (bitsPerSample / 8) * channels;
  const chunks = [];

  const silence = (seconds) =>
    Buffer.alloc(Math.round(seconds * sampleRate) * bytesPerSample);

  for (const scene of scenes) {
    let cursor = 0;
    for (const line of scene.lines) {
      chunks.push(silence(line.start - cursor));
      const clip = readWav(join(ttsDir, `${line.id}.wav`));
      chunks.push(clip.data);
      cursor = line.end;
    }
    chunks.push(silence(scene.duration - cursor));
  }

  const data = Buffer.concat(chunks);
  writeWav(outPath, { sampleRate, channels, bitsPerSample, data });
}

function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error(`not a RIFF file: ${path}`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      fmt = {
        channels: body.readUInt16LE(2),
        sampleRate: body.readUInt32LE(4),
        bitsPerSample: body.readUInt16LE(14),
      };
    } else if (id === "data") {
      data = Buffer.from(body);
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`malformed wav: ${path}`);
  return { ...fmt, data };
}

function writeWav(path, { sampleRate, channels, bitsPerSample, data }) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

/** Greedy wrap at ~80 characters so captions stay two lines or fewer. */
function wrap(text, width = 80) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}

/**
 * Split a narration line into caption chunks of at most two lines each, so a
 * long sentence scrolls through the caption box instead of filling it.
 */
function chunk(text, maxChars = 160, width = 80) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  let length = 0;
  for (const word of words) {
    const added = word.length + (current.length ? 1 : 0);
    if (current.length && length + added > maxChars) {
      chunks.push(current.join(" "));
      current = [word];
      length = word.length;
    } else {
      current.push(word);
      length += added;
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks.map((c) => wrap(c, width));
}

function assTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

function buildAss(scenes) {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Segoe UI,32,&H00FFFFFF,&H000000FF,&H70000000,&H70000000,0,0,0,0,100,100,0,0,3,10,0,2,170,170,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = [];
  for (const scene of scenes) {
    for (const line of scene.lines) {
      const start = scene.start + line.start;
      const span = line.end - line.start;
      const pieces = chunk(line.text);
      const totalChars = pieces.reduce(
        (n, p) => n + p.replace(/\\N/g, "").length,
        0,
      );
      let cursor = start;
      for (const piece of pieces) {
        const chars = piece.replace(/\\N/g, "").length;
        const share = (chars / totalChars) * span;
        events.push(
          `Dialogue: 0,${assTime(cursor)},${assTime(
            cursor + share,
          )},Cap,,0,0,0,,${piece}`,
        );
        cursor += share;
      }
    }
  }
  return head + events.join("\n") + "\n";
}
