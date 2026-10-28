// bun scripts/setup.ts — link the runtime this app builds against.
//
// The app is bundled by the vendored toolchain but resolved from THIS
// repository: an import of "solid-js" or "@pocketjs/framework/compact" in
// app/ walks up to ./node_modules, not into the submodule. The packages
// vendor/pocketjs already installed are linked here, which also keeps one
// copy of Solid: two would give the app a reactive graph the framework does
// not own.

import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { ROOT, VENDOR } from "./paths.ts";

if (!existsSync(resolve(VENDOR, "package.json"))) {
  throw new Error("setup: initialize vendor/pocketjs first (git submodule update --init), or set POCKETJS");
}

const links: [string, string][] = [
  ["node_modules/@pocketjs/framework", "."],
  ["node_modules/solid-js", "node_modules/solid-js"],
  ["node_modules/bun-types", "node_modules/bun-types"],
  ["node_modules/@types/bun", "node_modules/@types/bun"],
  ["node_modules/typescript", "node_modules/typescript"],
];

for (const [destination, source] of links) {
  const target = resolve(VENDOR, source);
  if (!existsSync(target)) throw new Error(`setup: missing ${target}; run bun install in ${VENDOR}`);
  const link = resolve(ROOT, destination);
  mkdirSync(dirname(link), { recursive: true });
  rmSync(link, { recursive: true, force: true });
  symlinkSync(relative(dirname(link), target), link, "dir");
}
console.log(`setup: node_modules links to ${relative(ROOT, VENDOR) || VENDOR}`);
