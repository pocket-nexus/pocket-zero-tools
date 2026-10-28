// Level: the bubble between two rings, the angle finder's ruler, and the
// compass tape. Left and right switch the three; Enter holds the reading;
// Tab zeroes the level (or runs the compass calibration).

import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { BubbleLevel, Chip, cycle, Gauge, KeyValue, Progress, TapeCompass, Tuner, toast, useHints, useNav, useSceneActive, KEY_LABEL, SectionBody, SectionTabs } from "@pocketjs/framework/compact";
import { createTopic, message, post, type Motion } from "../device.ts";

const MODES = ["level", "angle", "compass"] as const;
type Mode = (typeof MODES)[number];
const TABS = ["LEVEL", "ANGLE", "COMPASS"];

export function LevelScene() {
  const active = useSceneActive();
  const motion = createTopic<Motion>("/dev/motion", 1 / 15, active);
  const [mode, setMode] = createSignal<Mode>("level");
  const [frozen, setFrozen] = createSignal(false);
  const [held, setHeld] = createSignal<Motion | null>(null);
  const reading = createMemo(() => (frozen() ? held() : motion.data()));
  const unavailable = () => motion.data() !== null && !motion.data()!.available;

  const freeze = () => {
    if (frozen()) setFrozen(false);
    else {
      setHeld(motion.data());
      setFrozen(true);
    }
  };
  const zero = async () => {
    const m = motion.data();
    if (!m) return;
    try {
      if (m.zeroed) {
        await post("/dev/motion/unzero");
        toast("Zero cleared");
      } else {
        await post("/dev/motion/zero");
        toast("Level zeroed here");
      }
      motion.refresh();
    } catch (error) {
      toast(message(error), "warn");
    }
  };
  const calibrate = async () => {
    const m = motion.data();
    if (!m) return;
    try {
      if (m.calibrating) {
        const result = (await post("/dev/motion/calibrate", { on: false })) as { applied: boolean };
        toast(result.applied ? "Compass calibrated" : "Turn it more, then Tab", result.applied ? "ok" : "warn");
      } else {
        await post("/dev/motion/calibrate", { on: true });
        toast("Turn the Zero in every direction");
      }
      motion.refresh();
    } catch (error) {
      toast(message(error), "warn");
    }
  };
  useNav(event => {
    switch (event.key) {
      case "left":
        setMode(cycle(MODES, mode(), -1));
        return true;
      case "right":
        setMode(cycle(MODES, mode(), 1));
        return true;
      case "ok":
        freeze();
        return true;
      case "action":
        void (mode() === "compass" ? calibrate() : zero());
        return true;
    }
    return;
  });
  useHints(() => {
    const act = mode() === "compass" ? (motion.data()?.calibrating ? "finish calibration" : "calibrate") : motion.data()?.zeroed ? "clear zero" : "zero";
    return `${KEY_LABEL.leftright} mode   ${KEY_LABEL.ok} ${frozen() ? "resume" : "hold"}   ${KEY_LABEL.action} ${act}   ${KEY_LABEL.back} back`;
  });
  createEffect(() => {
    if (!active()) setFrozen(false);
  });

  const roll = () => reading()?.roll ?? 0;
  const pitch = () => reading()?.pitch ?? 0;
  const bubbleX = () => reading()?.bubble[0] ?? 0;
  const bubbleY = () => reading()?.bubble[1] ?? 0;
  const state = () => (frozen() ? "HELD" : unavailable() ? "NO IMU" : motion.data() ? "LIVE" : "WAITING");
  const stateTone = () => (frozen() ? "dim" : unavailable() ? "warn" : motion.data() ? "ok" : "dim");
  const field = () => {
    const m = reading();
    if (!m?.mag) return "none";
    const [x, y, z] = m.mag;
    return `${Math.round(Math.hypot(x, y, z))} uT`;
  };

  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <SectionTabs items={TABS} active={() => MODES.indexOf(mode())} />
      <Chip text={state} tone={stateTone} x={254} y={3} />
      <SectionBody active={() => MODES.indexOf(mode())} count={MODES.length}>
        <Show when={mode() === "level"}>
          <BubbleLevel bubbleX={bubbleX} bubbleY={bubbleY} size={104} x={14} y={22} frozen={frozen} />
          <Gauge value={roll} decimals={1} signed unit="deg" label="ROLL  X" x={128} y={22} w={94} size="xxl" min={-18} max={18} />
          <Gauge value={pitch} decimals={1} signed unit="deg" label="PITCH  Y" x={222} y={22} w={94} size="xxl" min={-18} max={18} />
          <KeyValue label="zero" value={() => (reading()?.zeroed ? "set" : "none")} x={130} y={80} w={178} />
          <KeyValue label="gravity" value={() => (reading() ? `${(Math.hypot(...reading()!.accel) / 9.81).toFixed(2)} g` : "--")} x={130} y={98} w={178} />
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 130, insetT: 118 }}>
            {Math.hypot(bubbleX(), bubbleY()) < 0.08 ? "Level within 1.5 deg" : "Centre the bubble to level"}
          </Text>
        </Show>
        <Show when={mode() === "angle"}>
          <Gauge value={roll} decimals={1} signed unit="deg" label="ANGLE OF THE LONG EDGE" x={10} y={20} w={300} size="huge" min={-90} max={90} />
          <Tuner value={roll} min={-90} max={90} step={5} major={3} pxPerStep={15} decimals={0} x={10} y={92} w={300} h={44} rulerOnly />
        </Show>
        <Show when={mode() === "compass"}>
          <TapeCompass heading={() => (reading()?.heading ?? null)} x={10} y={18} w={300} h={72} />
          <Show
            when={motion.data()?.calibrating}
            fallback={
              <>
                <KeyValue label="field" value={field} x={10} y={100} w={140} />
                <KeyValue label="magnetometer" value={() => (reading()?.magAvailable ? "BMM150" : "absent")} x={170} y={100} w={140} tone={() => (reading()?.magAvailable ? "ink" : "warn")} />
                <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 10, insetT: 120 }}>
                  Bearing of the top edge. Keep magnets and cables away.
                </Text>
              </>
            }
          >
            <Text class="absolute text-xs font-bold leading-[14] text-[#ffd23f]" style={{ insetL: 10, insetT: 98 }}>
              Calibrating: turn the Zero through every direction
            </Text>
            <Progress value={() => motion.data()?.calibration ?? 0} x={10} y={116} w={300} h={6} tone="accent" />
          </Show>
        </Show>
      </SectionBody>
    </View>
  );
}
