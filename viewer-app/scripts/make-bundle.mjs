#!/usr/bin/env node
// 持ち帰り用: テキストのファイルだけを「=== パス ===」の見出しつきで app-bundle.txt に連結する。
// 使い方: node scripts/make-bundle.mjs
// mp4・png などは含めない（fixtures は node scripts/make-fixtures.mjs で作り直せる）。
// node_modules・.next・out/・package-lock.json・.env（接続先）も含めない。
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "app-bundle.txt";
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", ".vercel"]);
const SKIP_FILES = new Set([TARGET, "package-lock.json", ".start_ts", "tsconfig.tsbuildinfo"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css", ".txt", ".sh", ".yml", ".yaml", ".sql"]);
const TEXT_NAMES = new Set([".gitignore", ".env.example"]);
const MAX_BYTES = 300 * 1024;

function walk(dir, rel) {
  const found = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || r === "out") continue;
      found.push(...walk(path.join(dir, e.name), r));
    } else if (e.isFile()) {
      found.push(r);
    }
  }
  return found;
}

const parts = [];
const listed = [];
for (const rel of walk(root, "")) {
  const base = path.basename(rel);
  if (SKIP_FILES.has(base)) continue;
  if (base.startsWith(".env") && base !== ".env.example") continue;
  if (!TEXT_EXT.has(path.extname(base).toLowerCase()) && !TEXT_NAMES.has(base)) continue;
  const abs = path.join(root, rel);
  if (statSync(abs).size > MAX_BYTES) continue;
  const text = readFileSync(abs, "utf8");
  if (text.includes("\u0000")) continue;
  parts.push(`=== ${rel} ===\n${text}${text.endsWith("\n") ? "" : "\n"}`);
  listed.push(rel);
}

writeFileSync(path.join(root, TARGET), parts.join("\n"));
console.log(`${TARGET}: ${listed.length} ファイル / ${statSync(path.join(root, TARGET)).size} バイト`);
console.log(listed.join("\n"));
