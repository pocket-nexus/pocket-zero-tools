// The tools, in groups the Home grid shows. Each names what it needs of the
// device (device.ts Capabilities): a tool whose need is absent still opens
// and says so, since the panel must state what it cannot read. A new tool
// is one row here and one icon in icons/.

import type { JSX } from "solid-js";
import type { Capabilities } from "../device.ts";
import { AudioScene } from "./audio.tsx";
import { CalculatorScene } from "./calculator.tsx";
import { CameraScene } from "./camera.tsx";
import { ClockScene } from "./clock.tsx";
import { FlashlightScene } from "./flashlight.tsx";
import { IrScene } from "./ir.tsx";
import { KeysScene } from "./keys.tsx";
import { LevelScene } from "./level.tsx";
import { MetronomeScene } from "./metronome.tsx";
import { MotionScene } from "./motion.tsx";
import { RadioScene } from "./radio.tsx";
import { SystemScene } from "./system.tsx";
import { CounterScene } from "./counter.tsx";

export interface Applet {
  id: string;
  title: string;
  summary: string;
  icon: string;
  group: string;
  /** The capabilities the tool reads; null when none is needed. */
  needs: ((caps: Capabilities) => boolean) | null;
  /** What is missing, for the Home tile. */
  missing: string;
  render: () => JSX.Element;
}

export const GROUPS = ["Sense", "Signal", "Media", "Time", "Desk", "System"] as const;

export const APPLETS: readonly Applet[] = [
  { id: "level", title: "Level", summary: "Bubble level, angle finder and compass", icon: "icons/level.svg", group: "Sense", needs: caps => caps.motion, missing: "no IMU", render: LevelScene },
  { id: "motion", title: "Motion", summary: "Shake, acceleration and impact log", icon: "icons/motion.svg", group: "Sense", needs: caps => caps.motion, missing: "no IMU", render: MotionScene },
  { id: "ir", title: "IR Remote", summary: "Learn a remote's keys and send them", icon: "icons/ir.svg", group: "Signal", needs: caps => caps.ir.tx || caps.ir.rx, missing: "no IR port", render: IrScene },
  { id: "radio", title: "Radio", summary: "Wi-Fi networks and Bluetooth devices nearby", icon: "icons/radio.svg", group: "Signal", needs: caps => caps.wifi || caps.ble, missing: "no scan tools", render: RadioScene },
  { id: "audio", title: "Audio", summary: "Level, spectrum, tuner and recorder", icon: "icons/audio.svg", group: "Media", needs: caps => caps.audio.capture, missing: "no microphone", render: AudioScene },
  { id: "camera", title: "Camera", summary: "Take a picture, read a QR code", icon: "icons/camera.svg", group: "Media", needs: caps => caps.camera, missing: "no camera", render: CameraScene },
  { id: "clock", title: "Clock", summary: "Time, countdown timer and stopwatch", icon: "icons/clock.svg", group: "Time", needs: null, missing: "", render: ClockScene },
  { id: "metronome", title: "Metronome", summary: "A tempo on a ruler with a click each beat", icon: "icons/metronome.svg", group: "Time", needs: caps => caps.audio.play, missing: "no speaker", render: MetronomeScene },
  { id: "calculator", title: "Calculator", summary: "Expressions typed on the keyboard", icon: "icons/calculator.svg", group: "Desk", needs: null, missing: "", render: CalculatorScene },
  { id: "counter", title: "Counter", summary: "A hand counter: Enter for each person, lap or item", icon: "icons/counter.svg", group: "Desk", needs: null, missing: "", render: CounterScene },
  { id: "keys", title: "Keys", summary: "What each key sends, by name", icon: "icons/keys.svg", group: "Desk", needs: null, missing: "", render: KeysScene },
  { id: "system", title: "System", summary: "Battery, network, brightness and volume", icon: "icons/system.svg", group: "System", needs: null, missing: "", render: SystemScene },
  { id: "flashlight", title: "Flashlight", summary: "The panel as a lamp at full brightness", icon: "icons/flashlight.svg", group: "System", needs: caps => caps.backlight, missing: "no backlight", render: FlashlightScene },
];
