#!/usr/bin/env bun
// Tools for the M5Stack CardputerZero: build, package, install and shoot.
//
//   bun scripts/zero.ts build            the program for aarch64, the package and the icons -> .build/
//   bun scripts/zero.ts deb              .build/pocket-zero-tools_<version>-1_arm64.deb, the Store's package
//   bun scripts/zero.ts install <host>   the .deb over SSH (root@<address>) with dpkg, then APPLaunch restarts
//   bun scripts/zero.ts shot --script "<tick>:<event> ..." [--out <dir>]
//   bun scripts/zero.ts tour [--out <dir>]
//   bun scripts/zero.ts media            docs/media/*.gif and store/screenshots/*.png from the mock device
//   bun scripts/zero.ts check            app-builder.json against the CardputerZero Store's own policy script
//
// build    the profile of pocketjs programs/cardputer-zero, this app's package
//          compiled against it, and the program for aarch64 Linux against
//          glibc 2.36 (needs cargo-zigbuild and zig). The program is
//          pocketjs's: one binary runs this package with the device API and
//          the camera's video plane.
// deb      the package as the CardputerZero Store installs it: the program at
//          /usr/share/APPLaunch/bin/pocket-zero-tools, the package beside its
//          share directory, the launcher entry "Tools" with its icon, and a
//          udev rule that gives the CMA heap the names rpicam-apps opens. The
//          launcher starts it as `pi`; nothing runs as root.
// shot     the program built for this computer, without the panel and the
//          keyboard, answering the device API from the mock: each `shot`
//          event of the script becomes <out>/<tick>.png, 2x. Events are
//          buttons (UP, ENTER, ESC), keys (key:f, key:Enter, key:Escape,
//          key:Shift+ArrowRight) and typed text (type:hello_world).

import { $ } from "bun";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { deb, walk } from "./deb.ts";
import { drawIcon } from "./icon.ts";
import { BUILD, ROOT, VENDOR } from "./paths.ts";

const { encodePNG } = (await import(join(VENDOR, "tools/png.ts"))) as { encodePNG(rgba: Uint8Array, w: number, h: number): Uint8Array };

const manifest = JSON.parse(readFileSync(join(ROOT, "pocket.json"), "utf8")) as { version: string };
const builder = JSON.parse(readFileSync(join(ROOT, "app-builder.json"), "utf8")) as {
  app_name: string;
  package_name: string;
  version: string;
  bin_name: string;
  description: string;
  store: Record<string, unknown> & { icon: string; screenshots: string[]; author: { display_name: string; github?: string } };
};
if (builder.version !== manifest.version) throw new Error(`app-builder.json is ${builder.version}, pocket.json ${manifest.version}`);

const NAME = builder.package_name;
const VERSION = builder.version;
const REVISION = "1";
const MAINTAINER = "Pocket Nexus <7312949+doodlewind@users.noreply.github.com>";
const CONFIG = "programs/cardputer-zero/pocket.runtime-config.ts";
const TARGET = "aarch64-unknown-linux-gnu";
const PROFILE_RS = join(BUILD, "profile", "pocket_profile.rs");
const POCKET = join(BUILD, `${NAME}.pocket`);
const PROGRAM = join(BUILD, "cargo", TARGET, "release", "pocket-cardputer-zero");
const HOST_PROGRAM = join(BUILD, "host", "debug", "pocket-cardputer-zero");
const [WIDTH, HEIGHT] = [320, 170];

const PREFIX = "/usr/share/APPLaunch";
const BINARY = `${PREFIX}/bin/${builder.bin_name}`;
const INSTALLED_POCKET = `${PREFIX}/share/${NAME}/${NAME}.pocket`;
const DESKTOP = `[Desktop Entry]
Type=Application
Name=${builder.app_name}
Comment=${builder.description}
Exec=${BINARY} --package ${INSTALLED_POCKET}
Icon=share/images/${NAME}.png
Terminal=false
`;
// rpicam-apps allocates its capture buffers from /dev/dma_heap/linux,cma (or
// vidbuf_cached); the Zero's kernel names its CMA heap default_cma_region.
// udev replaces the comma in a SYMLINK name, so that one is made by a command.
const UDEV = `SUBSYSTEM=="dma_heap", KERNEL=="default_cma_region", SYMLINK+="dma_heap/vidbuf_cached", RUN+="/bin/ln -sf default_cma_region /dev/dma_heap/linux,cma"\n`;
const UDEV_RELOAD = `#!/bin/sh
set -e
if command -v udevadm >/dev/null 2>&1; then
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=dma_heap || true
fi
exit 0
`;

const argv = process.argv.slice(2);
const option = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

async function compile(): Promise<void> {
  if (!existsSync(join(ROOT, "node_modules", "@pocketjs", "framework"))) throw new Error("run `bun run setup` (or bun scripts/setup.ts) first");
  await $`bun tools/pocket.ts profile export --config ${CONFIG} --out ${join(BUILD, "profile")}`.cwd(VENDOR).quiet();
  await $`bun tools/pocket.ts compile --manifest ${join(ROOT, "pocket.json")} --project-root ${ROOT} --runtime-config ${CONFIG} --plan-dir ${join(BUILD, "plan")} --outdir ${join(BUILD, "dist")} --output ${POCKET}`.cwd(VENDOR);
}

async function build(): Promise<void> {
  mkdirSync(BUILD, { recursive: true });
  await compile();
  await $`cargo zigbuild --release -p pocket-cardputer-zero --target ${TARGET}.2.36 --target-dir ${join(BUILD, "cargo")}`
    .cwd(VENDOR)
    .env({ ...process.env, POCKETJS_PROFILE_RS: PROFILE_RS });
  writeFileSync(join(BUILD, `${NAME}.png`), encodePNG(drawIcon(100, false), 100, 100));
  writeFileSync(join(ROOT, builder.store.icon), encodePNG(drawIcon(256, true), 256, 256));
  console.log(`zero: ${PROGRAM}\nzero: ${POCKET}`);
}

function debPath(): string {
  return join(BUILD, `${NAME}_${VERSION}-${REVISION}_arm64.deb`);
}

async function makeDeb(): Promise<string> {
  await build();
  const stage = join(BUILD, "deb");
  rmSync(stage, { recursive: true, force: true });
  const put = (path: string, data: Uint8Array | string) => {
    const target = join(stage, path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, data);
  };
  put(BINARY, readFileSync(PROGRAM));
  put(INSTALLED_POCKET, readFileSync(POCKET));
  put(`${PREFIX}/share/images/${NAME}.png`, readFileSync(join(BUILD, `${NAME}.png`)));
  put(`${PREFIX}/applications/${NAME}.desktop`, DESKTOP);
  put(`/usr/lib/udev/rules.d/99-${NAME}-camera.rules`, UDEV);
  put(`/usr/share/doc/${NAME}/copyright`, `${builder.app_name} (${NAME})\nSource: ${builder.store.source_repo}\nLicense: ${builder.store.license}\n\n${readFileSync(join(ROOT, "LICENSE"), "utf8")}`);
  const data = walk(stage, path => path === BINARY.slice(1));
  const installedKiB = Math.ceil(data.reduce((sum, entry) => sum + (entry.data?.length ?? 0), 0) / 1024);
  const control = `Package: ${NAME}
Version: ${VERSION}-${REVISION}
Architecture: arm64
Maintainer: ${MAINTAINER}
Installed-Size: ${installedKiB}
Section: APPLaunch
Priority: optional
Homepage: ${builder.store.source_repo}
Recommends: rpicam-apps, alsa-utils, network-manager, bluez
Description: ${builder.app_name} for the M5Stack CardputerZero
 ${builder.store.summary}
 .
 Built with PocketJS: https://github.com/pocket-nexus/pocketjs
`;
  const bytes = deb({ control, postinst: UDEV_RELOAD, postrm: UDEV_RELOAD }, ["postinst", "postrm"], data, Math.floor(Date.now() / 1000));
  writeFileSync(debPath(), bytes);
  console.log(`zero: ${debPath()} (${(bytes.length / 1024).toFixed(0)} KiB)`);
  return debPath();
}

async function install(host: string): Promise<void> {
  const file = await makeDeb();
  const remote = `/tmp/${basename(file)}`;
  await $`scp -q ${file} ${host}:${remote}`;
  await $`ssh ${host} ${[
    "set -e",
    // An install from before the Store package (pocketjs tools/cardputer-zero.ts)
    // ran the program as root through sudo and kept its files in /opt/pocket/zero.
    "rm -f /etc/sudoers.d/pocket-zero-tools /usr/share/pocketjs/zero-tools.pocket",
    `if [ -f /etc/udev/rules.d/99-pocket-dma-heap.rules ] && grep -q default_cma_region /etc/udev/rules.d/99-pocket-dma-heap.rules; then rm /etc/udev/rules.d/99-pocket-dma-heap.rules; fi`,
    `if [ -d /opt/pocket/zero ] && [ ! -e /home/pi/.config/${NAME} ]; then mkdir -p /home/pi/.config && cp -a /opt/pocket/zero /home/pi/.config/${NAME} && chown -R pi:pi /home/pi/.config/${NAME}; fi`,
    `dpkg -i ${remote}`,
    `rm ${remote}`,
    `dpkg -s ${NAME} | grep -E '^(Status|Version)'`,
    `sudo -u pi ${BINARY} --check --package ${INSTALLED_POCKET}`,
    "systemctl --user -M pi@ restart APPLaunch.service",
  ].join(" && ")}`;
}

async function hostProgram(): Promise<string> {
  await compile();
  await $`cargo build -p pocket-cardputer-zero --target-dir ${join(BUILD, "host")}`.cwd(VENDOR).env({ ...process.env, POCKETJS_PROFILE_RS: PROFILE_RS }).quiet();
  return HOST_PROGRAM;
}

/** A frame the program wrote (320x170 RGB565, little endian) as RGBA at `scale`. */
function rgba(raw: Uint8Array, scale: number): Uint8Array {
  const out = new Uint8Array(WIDTH * scale * HEIGHT * scale * 4);
  for (let y = 0; y < HEIGHT * scale; y++) {
    for (let x = 0; x < WIDTH * scale; x++) {
      const at = (Math.floor(y / scale) * WIDTH + Math.floor(x / scale)) * 2;
      const v = raw[at]! | (raw[at + 1]! << 8);
      const o = (y * WIDTH * scale + x) * 4;
      out[o] = (((v >> 11) & 31) * 255) / 31;
      out[o + 1] = (((v >> 5) & 63) * 255) / 63;
      out[o + 2] = ((v & 31) * 255) / 31;
      out[o + 3] = 255;
    }
  }
  return out;
}

function convert(dir: string, scale = 2): void {
  for (const name of readdirSync(dir).filter(name => name.endsWith(".rgb565"))) {
    writeFileSync(join(dir, name.replace(/\.rgb565$/, ".png")), encodePNG(rgba(readFileSync(join(dir, name)), scale), WIDTH * scale, HEIGHT * scale));
  }
}

async function run(binary: string, script: string, dir: string, store = join(BUILD, "mock-store")): Promise<void> {
  mkdirSync(dir, { recursive: true });
  mkdirSync(store, { recursive: true });
  await $`${binary} --package ${POCKET} --store ${store} --mock --shot ${dir} --script ${script}`.quiet();
}

/** Every tool's main screen after its device data arrived; each opens
 *  through the search, so the scripts do not depend on the grid's rows. */
const TOUR: [string, string][] = [
  ["home", "40:shot"],
  ["level", "20:key:/ 22:type:level 30:key:Enter 70:shot 72:key:c 90:shot 92:key:c 120:shot"],
  ["ir", "20:key:/ 22:type:ir 30:key:Enter 60:shot 62:key:c 64:key:c 66:key:Enter 80:shot 150:shot"],
  ["audio", "20:key:/ 22:type:audio 30:key:Enter 80:shot 82:key:c 110:shot 112:key:c 140:shot 142:key:c 170:shot"],
  ["radio", "20:key:/ 22:type:radio 30:key:Enter 40:shot 130:shot 132:key:c 250:shot"],
  ["camera", "20:key:/ 22:type:camera 30:key:Enter 40:shot 90:shot 92:key:Enter 94:shot 100:shot 130:shot 132:key:Tab 200:shot"],
  ["motion", "20:key:/ 22:type:motion 30:key:Enter 100:shot"],
  ["clock", "20:key:/ 22:type:clock 30:key:Enter 50:shot 52:key:c 70:shot 72:key:Enter 110:shot"],
  ["system", "20:key:/ 22:type:system 30:key:Enter 80:shot 82:key:x 84:key:x 86:key:x 88:key:x 90:key:c 100:shot"],
  ["metronome", "20:key:/ 22:type:metro 30:key:Enter 60:shot 62:key:Enter 76:shot 92:shot"],
  ["calculator", "20:key:/ 22:type:calc 30:key:Enter 50:type:12 52:key:c 54:key:Enter 56:type:30 60:key:Enter 70:shot 72:type:7 74:key:f 76:key:Enter 78:type:6 80:shot 82:key:Enter 100:shot"],
  ["counter", "20:key:/ 22:type:counter 30:key:Enter 50:key:Enter 52:key:Enter 54:key:Shift+ArrowRight 70:shot"],
  ["keys", "20:key:/ 22:type:keys 30:key:Enter 50:key:h 52:key:i 54:key:q 56:key:Shift+ArrowLeft 70:shot"],
  ["flashlight", "20:key:/ 22:type:flash 30:key:Enter 60:shot 62:key:Enter 70:shot"],
  ["sizes", "40:shot 42:key:Tab 44:shot 48:shot 60:shot 62:key:Tab 64:shot 68:shot 80:shot 82:key:x 90:shot"],
  ["search", "20:key:/ 30:shot 32:type:rad 50:shot"],
  ["quit", "20:key:Escape 40:shot"],
];

async function tour(dir: string): Promise<void> {
  const binary = await hostProgram();
  rmSync(join(BUILD, "mock-store"), { recursive: true, force: true });
  for (const [name, script] of TOUR) {
    await run(binary, script, join(dir, name));
    convert(join(dir, name));
  }
  console.log(`zero: tour in ${dir}`);
}

/** The README's motion, every tick of each sequence (30 frames a second). */
const CLIPS: { name: string; keys: string; from: number; to: number }[] = [
  // Tab steps the grid medium -> small -> large -> medium.
  { name: "grid-sizes", keys: "30:key:Tab 62:key:Tab 94:key:Tab 112:key:x 120:key:c", from: 24, to: 136 },
  // Level's three sections, left and right.
  { name: "level-sections", keys: "20:key:/ 22:type:level 30:key:Enter 70:key:c 96:key:c 122:key:z 148:key:z", from: 64, to: 172 },
  // System's rows scroll as the focus passes the edge.
  { name: "system-rows", keys: "20:key:/ 22:type:system 30:key:Enter 70:key:x 78:key:x 86:key:x 94:key:x 102:key:x 110:key:x 118:key:x 126:key:x 150:key:f 158:key:f 166:key:f 174:key:f", from: 64, to: 190 },
  // The search: matches glide out of the grid, Enter opens one.
  { name: "search", keys: "30:key:/ 40:type:c 52:type:a 64:type:m 90:key:Enter", from: 24, to: 180 },
  // The calculator's pad: a direction and Enter put an operator in.
  { name: "calculator", keys: "20:key:/ 22:type:calc 30:key:Enter 56:type:12 66:key:c 74:key:Enter 84:type:30 96:key:Enter 112:key:f 122:key:Enter 130:type:4 142:key:Enter", from: 50, to: 170 },
];

/** One 320x170 PNG per store screenshot (app-builder.json store.screenshots). */
const SCREENSHOTS: { file: string; script: string; tick: number }[] = [
  { file: "01-home.png", script: "40:shot", tick: 40 },
  { file: "02-level.png", script: "20:key:/ 22:type:level 30:key:Enter 90:shot", tick: 90 },
  { file: "03-audio.png", script: "20:key:/ 22:type:audio 30:key:Enter 82:key:c 120:shot", tick: 120 },
  { file: "04-radio.png", script: "20:key:/ 22:type:radio 30:key:Enter 140:shot", tick: 140 },
  { file: "05-calculator.png", script: "20:key:/ 22:type:calc 30:key:Enter 50:type:12 52:key:c 54:key:Enter 56:type:30 60:key:Enter 72:type:7 74:key:f 76:key:Enter 78:type:6 90:shot", tick: 90 },
  { file: "06-small-grid.png", script: "30:key:Tab 60:shot", tick: 60 },
];

async function media(): Promise<void> {
  const binary = await hostProgram();
  const work = join(BUILD, "media");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(ROOT, "docs", "media"), { recursive: true });
  for (const clip of CLIPS) {
    const dir = join(work, clip.name);
    const shots = Array.from({ length: clip.to - clip.from + 1 }, (_, i) => `${clip.from + i}:shot`).join(" ");
    rmSync(join(BUILD, "mock-store"), { recursive: true, force: true });
    await run(binary, `${clip.keys} ${shots}`, dir);
    const frames = join(dir, "frames");
    mkdirSync(frames, { recursive: true });
    for (let tick = clip.from; tick <= clip.to; tick++) {
      writeFileSync(join(frames, `${String(tick - clip.from).padStart(4, "0")}.png`), encodePNG(rgba(readFileSync(join(dir, `${tick}.rgb565`)), 2), WIDTH * 2, HEIGHT * 2));
    }
    const gif = join(ROOT, "docs", "media", `${clip.name}.gif`);
    await $`ffmpeg -loglevel error -y -framerate 30 -i ${join(frames, "%04d.png")} -vf ${"split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none"} -loop 0 ${gif}`;
    console.log(`zero: ${gif}`);
  }
  for (const shot of SCREENSHOTS) {
    const dir = join(work, "store", shot.file);
    rmSync(join(BUILD, "mock-store"), { recursive: true, force: true });
    await run(binary, shot.script, dir);
    const target = join(ROOT, "store", "screenshots", shot.file);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, encodePNG(rgba(readFileSync(join(dir, `${shot.tick}.rgb565`)), 1), WIDTH, HEIGHT));
    console.log(`zero: ${target}`);
  }
}

/** The Store's own policy script (CardputerZero/packages), run on the
 *  meta.json czdev would publish from app-builder.json. */
async function check(): Promise<void> {
  const stage = join(BUILD, "check", NAME);
  rmSync(join(BUILD, "check"), { recursive: true, force: true });
  mkdirSync(join(stage, "screenshots"), { recursive: true });
  const store = { ...builder.store } as Record<string, unknown> & typeof builder.store;
  const meta = {
    ...store,
    title: builder.app_name,
    icon: basename(store.icon),
    screenshots: store.screenshots.map(path => `screenshots/${basename(path)}`),
  };
  writeFileSync(join(stage, "meta.json"), JSON.stringify(meta, null, 2));
  copyFileSync(join(ROOT, store.icon), join(stage, basename(store.icon)));
  for (const path of store.screenshots) copyFileSync(join(ROOT, path), join(stage, "screenshots", basename(path)));
  const script = join(BUILD, "check", "store_meta_policy.py");
  await $`curl -sfL -m 20 https://raw.githubusercontent.com/CardputerZero/packages/main/.github/scripts/store_meta_policy.py -o ${script}`;
  const errors = join(BUILD, "check", "errors.txt");
  const warnings = join(BUILD, "check", "warnings.txt");
  await $`python3 ${script} ${NAME} ${stage} - ${errors} ${warnings}`.env({ ...process.env, DEB_MAINTAINER: MAINTAINER });
  if (existsSync(warnings)) for (const line of readFileSync(warnings, "utf8").trim().split("\n")) console.log(`  warning: ${line}`);
  if (existsSync(errors)) {
    for (const line of readFileSync(errors, "utf8").trim().split("\n")) console.error(`  error: ${line}`);
    process.exit(1);
  }
  console.log("zero: app-builder.json passes the Store's metadata policy (name and share code uniqueness are checked by the Store)");
}

switch (argv[0]) {
  case "build":
    await build();
    break;
  case "deb":
    await makeDeb();
    break;
  case "install":
    if (!argv[1]) throw new Error("install needs an SSH host, e.g. root@192.168.8.159");
    await install(argv[1]);
    break;
  case "shot": {
    const script = option("--script");
    if (!script) throw new Error("shot needs --script");
    const dir = resolve(option("--out") ?? join(BUILD, "shots"));
    await run(await hostProgram(), script, dir);
    convert(dir);
    console.log(`zero: frames in ${dir}`);
    break;
  }
  case "tour":
    await tour(resolve(option("--out") ?? join(BUILD, "tour")));
    break;
  case "media":
    await media();
    break;
  case "check":
    await check();
    break;
  default:
    console.error("usage: bun scripts/zero.ts build | deb | install <host> | shot --script <events> [--out <dir>] | tour [--out <dir>] | media | check");
    process.exit(2);
}
