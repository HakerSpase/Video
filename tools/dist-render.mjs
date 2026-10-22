#!/usr/bin/env node
// Распределённый рендер HyperFrames: план -> куски кадров (параллельно, на разных машинах) -> склейка.
//   node tools/dist-render.mjs plan     <проект> <planDir> [кадров_в_куске=300]
//   node tools/dist-render.mjs chunk    <planDir> <номер> <out.mp4>
//   node tools/dist-render.mjs assemble <planDir> <папка_с_кусками> <out.mp4>
// Использует внутренний модуль продюсера hyperframes (plan / renderChunk / assemble) —
// тот же, на котором работают `hyperframes lambda` и `cloudrun`.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VERSION = "0.8.185";
function hfDist() {
  // пакет из кэша npx (ставится заранее командой `npx -y hyperframes@VERSION --version`)
  const root = execSync(`npm root -g`).toString().trim();
  const cands = [join(root, "hyperframes", "dist")];
  const npx = join(process.env.HOME || "/root", ".npm", "_npx");
  if (existsSync(npx)) for (const d of readdirSync(npx)) cands.push(join(npx, d, "node_modules", "hyperframes", "dist"));
  for (const c of cands) {
    if (!existsSync(join(c, "..", "package.json"))) continue;
    const v = JSON.parse(execSync(`cat ${join(c, "..", "package.json")}`).toString()).version;
    if (v === VERSION) return c;
  }
  throw new Error(`hyperframes@${VERSION} не найден — запустите: npx -y hyperframes@${VERSION} --version`);
}
async function api() {
  const dist = hfDist();
  for (const f of readdirSync(dist).filter((f) => f.startsWith("chunk-") && f.endsWith(".js"))) {
    const src = execSync(`grep -l "async function renderChunk(" ${join(dist, f)} || true`).toString().trim();
    if (src) return import(pathToFileURL(join(dist, f)).href);
  }
  throw new Error("в hyperframes не найден модуль распределённого рендера");
}

const [cmd, a, b, c] = process.argv.slice(2);
const m = await api();
if (cmd === "plan") {
  const r = await m.plan(resolve(a), { fps: 30, width: 1080, height: 1920, format: "mp4", codec: "h264", quality: "standard",
    chunkSize: Number(c || 300) }, resolve(b), {});
  console.log(JSON.stringify(r));
} else if (cmd === "chunk") {
  await m.renderChunk(resolve(a), Number(b), resolve(c), {});
  console.log("chunk", b, "ok");
} else if (cmd === "assemble") {
  const parts = readdirSync(resolve(b)).filter((f) => f.endsWith(".mp4")).sort().map((f) => join(resolve(b), f));
  const audio = join(resolve(a), "audio.m4a"); // сведённый звук эпизода, его готовит plan
  const r = await m.assemble(resolve(a), parts, existsSync(audio) ? audio : undefined, resolve(c), {});
  console.log(JSON.stringify(r ?? { ok: true }));
} else {
  console.error("команды: plan | chunk | assemble");
  process.exit(1);
}
