// Motion: how much the Zero is being shaken, the acceleration on each axis,
// a trace of the last seconds, and the log of impacts above the threshold.

import { createEffect, createMemo, createSignal } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { Chip, createSelection, Gauge, KeyValue, List, Bars, useHints, useNav, useSceneActive, KEY_LABEL, GUTTER } from "@pocketjs/framework/compact";
import { createTopic, type Motion } from "../device.ts";
import { createHistory } from "../ui.tsx";

const G = 9.81;

export function MotionScene() {
  const active = useSceneActive();
  const motion = createTopic<Motion>("/dev/motion", 1 / 15, active);
  const [frozen, setFrozen] = createSignal(false);
  const [held, setHeld] = createSignal<Motion | null>(null);
  const [clearedBefore, setClearedBefore] = createSignal(0);
  const history = createHistory(64);
  const reading = () => (frozen() ? held() : motion.data());
  createEffect(() => {
    const m = motion.data();
    if (!m || frozen()) return;
    history.push(Math.min(1, Math.abs(Math.hypot(...m.accel) - G) / 20));
  });
  const impacts = createMemo(() => (reading()?.impacts ?? []).filter(([t]) => t > clearedBefore()));
  const selection = createSelection(() => impacts().length);
  useNav(event => {
    switch (event.key) {
      case "ok":
        if (frozen()) setFrozen(false);
        else {
          setHeld(motion.data());
          setFrozen(true);
        }
        return true;
      case "action":
        setClearedBefore(motion.data()?.t ?? 0);
        history.clear();
        return true;
      case "up":
        selection.move(-1);
        return true;
      case "down":
        selection.move(1);
        return true;
    }
    return;
  });
  useHints(() => `${KEY_LABEL.ok} ${frozen() ? "resume" : "hold"}   ${KEY_LABEL.action} clear log   ${KEY_LABEL.updown} log   ${KEY_LABEL.back} back`);
  const shake = () => (reading()?.shake ?? 0) * 100;
  const axis = (i: number) => () => (reading() ? `${reading()!.accel[i]!.toFixed(2)} m/s2` : "--");
  const state = () => (frozen() ? "HELD" : reading()?.available ? "LIVE" : "NO IMU");
  const stateTone = () => (frozen() ? "dim" : reading()?.available ? "ok" : "warn");
  const ago = (t: number) => {
    const now = motion.data()?.t ?? t;
    const seconds = Math.max(0, now - t);
    return seconds < 60 ? `${Math.round(seconds)} s ago` : `${Math.floor(seconds / 60)} min ago`;
  };
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Gauge value={shake} decimals={0} unit="%" label="SHAKE" x={GUTTER} y={2} w={124} size="big" min={0} max={100} tone={() => (shake() > 70 ? "warn" : "ink")} />
      <Chip text={state} tone={stateTone} x={140} y={4} />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 190, insetT: 4 }}>
        |a| - g, last 4 s
      </Text>
      <Bars values={history.values} x={140} y={18} w={174} h={42} tone="accent" />
      <KeyValue label="x" value={axis(0)} x={GUTTER} y={66} w={124} />
      <KeyValue label="y" value={axis(1)} x={GUTTER} y={82} w={124} />
      <KeyValue label="z" value={axis(2)} x={GUTTER} y={98} w={124} />
      <KeyValue label="peak" value={() => (reading() ? `${reading()!.impactPeak.toFixed(1)} m/s2` : "--")} x={GUTTER} y={114} w={124} tone={() => ((reading()?.impactPeak ?? 0) > 8 ? "warn" : "ink")} />
      <List items={impacts} selection={selection} label={([, g]) => `${g.toFixed(1)} m/s2`} value={([t]) => ago(t)} x={140} y={66} w={174} h={70} empty="No impact above 8 m/s2" />
    </View>
  );
}
