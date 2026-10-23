/**
 * Flatten script.json into the flat line list the TTS script consumes.
 *
 *   node tools/video/flatten.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, "work");
mkdirSync(work, { recursive: true });

const script = JSON.parse(
    readFileSync(join(here, "script.json"), "utf8")
);

const lines = [];
for (const scene of script.scenes) {
    for (const line of scene.lines) {
        lines.push({ id: line.id, text: line.text, scene: scene.id });
    }
}

writeFileSync(
    join(work, "lines.json"),
    JSON.stringify(lines, null, 2) + "\n"
);

const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
console.log(`${lines.length} lines, ${words} words`);
