// Audio: the microphone as a level meter with its waveform, a 32-band
// spectrum, a tuner that names the note and its error in cents, and a
// recorder with the recordings it made.

import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { Bars, Chip, confirm, createSelection, cycle, Gauge, KeyValue, List, RecorderStrip, SignalMeter, Tuner, toast, useHints, useNav, useSceneActive, KEY_LABEL, CONTENT_W, GUTTER, clock, bytes, SectionBody, SectionTabs } from "@pocketjs/framework/compact";
import { createTopic, message, post, type Audio } from "../device.ts";
import { createBlink } from "../ui.tsx";

const MODES = ["meter", "spectrum", "tuner", "record"] as const;
type Mode = (typeof MODES)[number];
const TABS = ["METER", "SPECTRUM", "TUNER", "RECORD"];
const FLOOR = -60;

export function AudioScene() {
  const active = useSceneActive();
  const audio = createTopic<Audio>("/dev/audio", 1 / 15, active);
  const [mode, setMode] = createSignal<Mode>("meter");
  const blink = createBlink();
  const recording = () => audio.data()?.recording ?? null;
  const recordings = createMemo(() => audio.data()?.recordings ?? []);
  const selection = createSelection(() => recordings().length);

  // The microphone runs while the scene is up, and stays on for a recording
  // that outlives it.
  createEffect(() => {
    if (active()) void post("/dev/audio/capture", { on: true }).catch(error => toast(message(error), "warn"));
    else if (!recording()) void post("/dev/audio/capture", { on: false }).catch(() => {});
  });
  onCleanup(() => {
    if (!recording()) void post("/dev/audio/capture", { on: false }).catch(() => {});
  });

  const toggleRecord = () => {
    const on = !recording();
    void post("/dev/audio/record", { on })
      .then(() => {
        audio.refresh();
        if (!on) toast("Recording saved", "ok");
      })
      .catch(error => toast(message(error), "warn"));
  };
  const play = () => {
    const item = recordings()[selection.index()];
    if (!item) return;
    void post("/dev/audio/play", { name: item.name }).catch(error => toast(message(error), "warn"));
  };
  const remove = () => {
    const item = recordings()[selection.index()];
    if (!item) return;
    void confirm({ title: "Delete this recording?", text: `${item.name} (${clock(item.seconds)}) is removed from the Zero.`, action: "Delete", danger: true }).then(ok => {
      if (!ok) return;
      void post("/dev/audio/delete", { name: item.name })
        .then(() => audio.refresh())
        .catch(error => toast(message(error), "warn"));
    });
  };
  useNav(event => {
    switch (event.key) {
      case "left":
        setMode(cycle(MODES, mode(), -1));
        return true;
      case "right":
        setMode(cycle(MODES, mode(), 1));
        return true;
      case "up":
        if (mode() === "record") selection.move(-1);
        return true;
      case "down":
        if (mode() === "record") selection.move(1);
        return true;
      case "ok":
        if (mode() === "record") play();
        return true;
      case "pause":
        toggleRecord();
        return true;
      case "action":
        if (mode() === "record") remove();
        return true;
    }
    return;
  });
  useHints(() => {
    if (mode() === "record") return `${KEY_LABEL.pause} ${recording() ? "stop" : "record"}   ${KEY_LABEL.ok} play   ${KEY_LABEL.action} delete   ${KEY_LABEL.back} back`;
    return `${KEY_LABEL.leftright} mode   ${KEY_LABEL.pause} ${recording() ? "stop recording" : "record"}   ${KEY_LABEL.back} back`;
  });

  const level = () => audio.data()?.level ?? FLOOR;
  const peak = () => audio.data()?.peak ?? FLOOR;
  const unit = (db: number) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR));
  const state = () => {
    const a = audio.data();
    if (!a) return "WAITING";
    if (a.error) return "NO MIC";
    if (a.recording) return "REC";
    return a.capturing ? "LIVE" : "OFF";
  };
  const stateTone = () => {
    const a = audio.data();
    if (!a) return "dim";
    if (a.error) return "warn";
    if (a.recording) return "warn";
    return a.capturing ? "ok" : "dim";
  };
  const pitch = () => audio.data()?.pitch ?? null;
  const cents = () => pitch()?.cents ?? 0;
  const inTune = () => pitch() !== null && Math.abs(cents()) < 5;

  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <SectionTabs items={TABS} active={() => MODES.indexOf(mode())} />
      <Chip text={state} tone={stateTone} x={262} y={3} />
      <Show when={audio.data()?.error}>
        <Text class="absolute text-2xs leading-[12] text-[#ff7fb4]" style={{ insetL: GUTTER, insetT: 122 }}>
          {audio.data()!.error}
        </Text>
      </Show>
      <SectionBody active={() => MODES.indexOf(mode())} count={MODES.length}>
        <Show when={mode() === "meter"}>
          <Gauge value={level} decimals={1} unit="dBFS" label="LEVEL" x={10} y={20} w={150} size="big" min={FLOOR} max={0} tone={() => (level() > -3 ? "warn" : "ink")} />
          <KeyValue label="peak" value={() => `${peak().toFixed(1)} dBFS`} x={10} y={100} w={150} />
          <SignalMeter value={() => unit(level())} peak={() => unit(peak())} x={170} y={26} w={140} h={12} segments={28} />
          <Bars values={() => audio.data()?.wave ?? []} x={170} y={48} w={140} h={64} tone="ok" mirror />
        </Show>
        <Show when={mode() === "spectrum"}>
          <Bars values={() => audio.data()?.spectrum ?? []} x={10} y={20} w={300} h={96} tone="accent" gap={2} />
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 10, insetT: 120 }}>
            60 Hz
          </Text>
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 150, insetT: 120 }}>
            700 Hz
          </Text>
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 282, insetT: 120 }}>
            8 kHz
          </Text>
        </Show>
        <Show when={mode() === "tuner"}>
          <Text class="absolute text-4xl font-bold leading-[38] text-center" style={{ insetL: 10, insetT: 18, width: 120, textColor: pitch() ? (inTune() ? "#3fd0e8" : "#fcf6ff") : "#8e80ac" }}>
            {pitch()?.note ?? "--"}
          </Text>
          <KeyValue label="frequency" value={() => (pitch() ? `${pitch()!.hz.toFixed(1)} Hz` : "no pitch")} x={140} y={24} w={170} />
          <KeyValue label="A4" value={() => "440 Hz"} x={140} y={42} w={170} />
          <Tuner value={cents} min={-50} max={50} step={5} major={2} pxPerStep={14} decimals={0} unit="cents" x={10} y={62} w={300} h={70} tone={() => (inTune() ? "ok" : "accent")} />
        </Show>
        <Show when={mode() === "record"}>
          <RecorderStrip recording={() => recording() !== null} seconds={() => recording()?.seconds ?? 0} level={() => unit(level())} blink={blink} x={GUTTER} y={18} w={CONTENT_W} />
          <List items={recordings} selection={selection} label={item => item.name.replace(/^rec-/, "").replace(/\.wav$/, "")} value={item => `${clock(item.seconds)}  ${bytes(item.bytes)}`} dot={item => (audio.data()?.playing === item.name ? "ok" : null)} x={GUTTER} y={48} w={CONTENT_W} h={88} empty="No recordings yet: Space starts one" />
        </Show>
      </SectionBody>
    </View>
  );
}
