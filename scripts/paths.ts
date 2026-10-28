// Where things are. The PocketJS toolchain, the runtime program and the
// framework come from vendor/pocketjs (a submodule pinned to the commit this
// app is built against); POCKETJS names another checkout while both change.
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
export const VENDOR = process.env.POCKETJS ? resolve(process.env.POCKETJS) : resolve(ROOT, "vendor/pocketjs");
export const BUILD = resolve(ROOT, ".build");
