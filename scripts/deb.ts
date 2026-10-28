// A Debian binary package from a staged tree, without dpkg: an ar archive of
// `debian-binary`, `control.tar.gz` and `data.tar.gz`, every tar entry owned
// by root (uid and gid 0), as dpkg-deb --root-owner-group writes it. The
// CardputerZero Store takes this package (`<name>_<version>-<revision>_arm64.deb`).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface Entry {
  name: string;
  mode: number;
  data?: Uint8Array;
}

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

function header(entry: Entry, mtime: number): Uint8Array {
  const block = new Uint8Array(512);
  const put = (text: string, at: number, width: number) => {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > width) throw new Error(`tar: field too long: ${text}`);
    block.set(bytes, at);
  };
  let name = entry.name;
  let prefix = "";
  if (new TextEncoder().encode(name).length > 100) {
    const cut = name.lastIndexOf("/", 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  put(name, 0, 100);
  put(octal(entry.mode, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(entry.data?.length ?? 0, 12), 124, 12);
  put(octal(mtime, 12), 136, 12);
  put("        ", 148, 8);
  put(entry.data ? "0" : "5", 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put("root", 265, 32);
  put("root", 297, 32);
  put(prefix, 345, 155);
  let sum = 0;
  for (const byte of block) sum += byte;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return block;
}

/** A gzipped ustar archive of `entries`, in order. */
export function tarGz(entries: Entry[], mtime: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(header(entry, mtime));
    if (entry.data) {
      parts.push(entry.data);
      const pad = (512 - (entry.data.length % 512)) % 512;
      if (pad) parts.push(new Uint8Array(pad));
    }
  }
  parts.push(new Uint8Array(1024));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** Every directory and file under `root`, as `./relative/path`, directories
 *  before their contents. */
export function walk(root: string, executable: (path: string) => boolean): Entry[] {
  const out: Entry[] = [{ name: "./", mode: 0o755 }];
  const visit = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const relative = `${rel}${name}`;
      if (statSync(path).isDirectory()) {
        out.push({ name: `./${relative}/`, mode: 0o755 });
        visit(path, `${relative}/`);
      } else {
        out.push({ name: `./${relative}`, mode: executable(relative) ? 0o755 : 0o644, data: readFileSync(path) });
      }
    }
  };
  visit(root, "");
  return out;
}

function arMember(name: string, data: Uint8Array, mtime: number): Uint8Array {
  // dpkg-deb writes member names space-padded, without the GNU slash.
  const head = name.padEnd(16) + String(mtime).padEnd(12) + "0".padEnd(6) + "0".padEnd(6) + "100644".padEnd(8) + String(data.length).padEnd(10) + "`\n";
  const parts = [new TextEncoder().encode(head), data];
  if (data.length % 2) parts.push(new TextEncoder().encode("\n"));
  return Buffer.concat(parts);
}

/** The .deb: `control` files (control, postinst, ...) and the data tree. */
export function deb(control: Record<string, string>, executables: string[], data: Entry[], mtime: number): Uint8Array {
  const controlEntries: Entry[] = [{ name: "./", mode: 0o755 }];
  for (const [name, text] of Object.entries(control)) {
    controlEntries.push({ name: `./${name}`, mode: executables.includes(name) ? 0o755 : 0o644, data: new TextEncoder().encode(text) });
  }
  return Buffer.concat([
    new TextEncoder().encode("!<arch>\n"),
    arMember("debian-binary", new TextEncoder().encode("2.0\n"), mtime),
    arMember("control.tar.gz", tarGz(controlEntries, mtime), mtime),
    arMember("data.tar.gz", tarGz(data, mtime), mtime),
  ]);
}
