// The Zero's device API as the applets read it: `http://zero/dev/<topic>`,
// which the program answers in process (pocketjs programs/cardputer-zero/
// src/device/mod.rs). A UI realm has no network: each call goes to the
// worker (worker.ts) as a `request` record and its answer comes back as
// `response` records, read once a frame. A topic is polled while its scene
// is active and read as a signal; a command is one POST.

import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { after } from "@pocketjs/framework/clock";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import { toAscii } from "@pocketjs/framework/compact";
import { Answer, HEADER_BYTES, encodeCall, text } from "./wire.ts";

export type NetMethod = "GET" | "POST" | "PUT" | "DELETE";

const ZERO = "http://zero";

export interface Capabilities {
  motion: boolean;
  magnet: boolean;
  battery: boolean;
  ir: { tx: boolean; rx: boolean };
  audio: { capture: boolean; play: boolean };
  camera: boolean;
  qr: boolean;
  wifi: boolean;
  ble: boolean;
  backlight: boolean;
  volume: boolean;
  mock: boolean;
}

export interface Motion {
  available: boolean;
  t: number;
  pitch: number;
  roll: number;
  heading: number | null;
  bubble: [number, number];
  accel: [number, number, number];
  gyro: [number, number, number];
  mag: [number, number, number] | null;
  magAvailable: boolean;
  shake: number;
  impactPeak: number;
  impacts: [number, number][];
  zeroed: boolean;
  calibrating: boolean;
  calibration: number | null;
}

export interface Battery {
  available: boolean;
  percent: number | null;
  voltage: number | null;
  current: number | null;
  power: number | null;
  status: string;
  temp: number | null;
}

export interface SystemInfo {
  hostname: string;
  uptime: number;
  load: [number, number, number];
  mem: { used: number; total: number };
  cpuTemp: number | null;
  ip: string | null;
  wifi: { ssid: string | null; rssi: number | null; link: number | null };
  backlight: { value: number; max: number } | null;
  volume: number | null;
  disk: { used: number; total: number } | null;
  clock: number;
}

export interface Audio {
  capturing: boolean;
  level: number;
  peak: number;
  spectrum: number[];
  wave: number[];
  pitch: { hz: number; note: string; cents: number } | null;
  blocks: number;
  recording: { name: string; seconds: number; started: number } | null;
  recordings: { name: string; seconds: number; bytes: number }[];
  playing: string | null;
  error: string | null;
  device: string;
}

export interface Ir {
  tx: boolean;
  rx: boolean;
  learning: boolean;
  sending: boolean;
  captured: { pulses: number[]; carrierHz: number; protocol: string; nec: { address: number; command: number; extended: boolean } | null; t: number } | null;
  lastSent: { t: number; ok: boolean; error: string } | null;
  signals: { id: number; name: string; protocol: string; count: number; nec: { address: number; command: number } | null }[];
}

export interface Network {
  ssid: string;
  bssid: string;
  signal: number;
  freq: number;
  chan: number;
  security: string;
  active: boolean;
}

export interface BleDevice {
  address: string;
  name: string | null;
  rssi: number | null;
}

export interface Radio {
  wifi: { scanning: boolean; t: number | null; error: string | null; networks: Network[] };
  ble: { scanning: boolean; t: number | null; error: string | null; devices: BleDevice[] };
}

export interface Camera {
  available: boolean;
  qrAvailable: boolean;
  busy: boolean;
  error: string | null;
  last: { name: string; t: number; at: number; width: number; height: number; qr: string | null; bytes: number } | null;
  photos: { name: string; bytes: number; modified: number }[];
  thumbnail: string | null;
  /** The live stream while the Camera tool is open. */
  live: {
    phase: "off" | "starting" | "live" | "failed";
    error: string | null;
    startedAt: number;
    frame: number;
    fps: number;
    scanning: boolean;
    qr: string | null;
  };
}

/** Calls in flight at once: the worker owns at most eight resources
 *  (contracts/spec/worker.ts WORKER_LIMITS), and the scenes' topics and
 *  commands queue here beyond six. */
const IN_FLIGHT = 6;

interface Call {
  record: Uint8Array;
  status: number;
  body: Uint8Array[];
  resolve(answer: { status: number; bytes: Uint8Array }): void;
  reject(error: Error): void;
}

let channels: { calls: ReturnType<typeof worker.channel>; answers: ReturnType<typeof worker.channel> } | null = null;
const pending = new Map<number, Call>();
const queued: number[] = [];
const unsent: number[] = [];
let nextId = 1;

function send(): void {
  while (queued.length && pending.size - queued.length < IN_FLIGHT) unsent.push(queued.shift()!);
  while (unsent.length && channels!.calls.publish(pending.get(unsent[0]!)!.record)) unsent.shift();
}

function open() {
  if (channels) return channels;
  channels = { calls: worker.channel("request"), answers: worker.channel("response") };
  onFrame(() => {
    for (const view of channels!.answers.observe()) {
      const id = view.u32(0);
      const call = pending.get(id);
      if (!call) continue;
      const kind = view.u8(4);
      if (kind === Answer.head) call.status = view.u16le(HEADER_BYTES);
      else if (kind === Answer.body) call.body.push(view.copy().subarray(HEADER_BYTES));
      else if (kind === Answer.end) {
        pending.delete(id);
        const failure = text(view.copy().subarray(HEADER_BYTES));
        if (failure) call.reject(new Error(failure));
        else {
          const bytes = new Uint8Array(call.body.reduce((sum, block) => sum + block.length, 0));
          let at = 0;
          for (const block of call.body) {
            bytes.set(block, at);
            at += block.length;
          }
          call.resolve({ status: call.status, bytes });
        }
      }
    }
    send();
  });
  return channels;
}

/** One call through the worker: the status and the body's bytes. */
function call(path: string, method: NetMethod, body: unknown, timeoutMs: number): Promise<{ status: number; bytes: Uint8Array }> {
  open();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const record = encodeCall(id, {
      url: `${ZERO}${path}`,
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs,
      maxBytes: 256 * 1024,
    });
    pending.set(id, { record, status: 0, body: [], resolve, reject });
    queued.push(id);
    send();
  });
}

export async function request<T>(path: string, method: NetMethod = "GET", body?: unknown, timeoutMs = 8000): Promise<T> {
  const answer = await call(path, method, body, timeoutMs);
  const raw = text(answer.bytes);
  let value: { error?: string } = {};
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    if (answer.status < 300) throw new Error("the device answered with something that is not JSON");
  }
  if (answer.status >= 300) throw new Error(value.error ?? (raw || `HTTP ${answer.status}`));
  return value as T;
}

/** Raw bytes of a device route (the camera's thumbnail). */
export async function requestBytes(path: string): Promise<Uint8Array> {
  const answer = await call(path, "GET", undefined, 8000);
  if (answer.status >= 300) throw new Error(`HTTP ${answer.status}`);
  return answer.bytes;
}

export const post = (path: string, body?: unknown): Promise<unknown> => request(path, "POST", body);

export const message = (error: unknown): string => toAscii(error instanceof Error ? error.message : String(error));

export interface Topic<T> {
  data: Accessor<T | null>;
  error: Accessor<string | null>;
  /** Poll now, then keep the cadence. */
  refresh(): void;
}

/** `GET /dev/<path>` every `seconds` while `active` is true. A failed poll
 *  keeps the last data, records the error and tries again at twice the
 *  cadence. */
export function createTopic<T>(path: string, seconds: number, active: Accessor<boolean> = () => true): Topic<T> {
  const [data, setData] = createSignal<T | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  let cancel: (() => void) | null = null;
  let running = false;
  let wanted = false;
  let generation = 0;
  const poll = async (): Promise<void> => {
    cancel?.();
    cancel = null;
    if (running) {
      wanted = true;
      return;
    }
    running = true;
    const mine = generation;
    let delay = seconds;
    try {
      const value = await request<T>(path);
      if (mine === generation) {
        setData(() => value);
        setError(null);
      }
    } catch (failure) {
      if (mine === generation) setError(message(failure));
      delay = seconds * 2;
    } finally {
      running = false;
    }
    if (mine !== generation) return;
    if (wanted) {
      wanted = false;
      return poll();
    }
    if (active()) cancel = after(delay, () => void poll());
  };
  createEffect(() => {
    if (active()) {
      generation++;
      void poll();
    } else {
      cancel?.();
      cancel = null;
      generation++;
    }
  });
  onCleanup(() => {
    cancel?.();
    generation++;
  });
  return { data, error, refresh: () => void poll() };
}

/** Read and write a small JSON blob the program keeps for the app. */
export const store = {
  get: <T>(key: string) => request<T | null>(`/dev/store/${key}`),
  set: (key: string, value: unknown) => request(`/dev/store/${key}`, "PUT", value),
};
