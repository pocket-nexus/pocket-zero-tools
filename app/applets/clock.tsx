// Clock: the time in large digits, a countdown timer and a stopwatch with
// laps. Left and right switch the three sections on every screen; the
// timer's length is set in an edit state Enter opens (left and right then
// step the minutes, Shift the seconds; Enter starts, Escape leaves the
// edit), so no screen changes what a key means while it stays up. The
// timer rings the speaker when it reaches zero.

import { createMemo, createSignal, onCleanup } from "solid-js";
import { Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { after } from "@pocketjs/framework/clock";
import { Chip, createSelection, cycle, Digits, KeyValue, List, Progress, toast, useHints, useNav, KEY_LABEL, CONTENT_W, GUTTER, digitsWidth, SectionBody, SectionTabs } from "@pocketjs/framework/compact";

/** The right column of the clock and timer sections. */
const SIDE_X = 196;
const SIDE_W = 320 - GUTTER - SIDE_X;
import { post } from "../device.ts";
import { createBlink } from "../ui.tsx";

const MODES = ["clock", "timer", "stopwatch"] as const;
type Mode = (typeof MODES)[number];
const TABS = ["CLOCK", "TIMER", "STOPWATCH"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (n: number) => String(n).padStart(2, "0");
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};
const lapText = (ms: number) => {
  const tenths = Math.floor(ms / 100);
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${two(s % 60)}.${tenths % 10}`;
};

export function ClockScene() {
  const [mode, setMode] = createSignal<Mode>("clock");
  const [now, setNow] = createSignal(Date.now());
  const blink = createBlink();
  let alive = true;
  const tick = () => {
    if (!alive) return;
    setNow(Date.now());
    after(0.1, tick);
  };
  tick();
  onCleanup(() => {
    alive = false;
  });

  // Timer: a length, an edit state for it, and when running, the moment it
  // ends.
  const [length, setLength] = createSignal(5 * 60 * 1000);
  const [editing, setEditing] = createSignal(false);
  const [endsAt, setEndsAt] = createSignal<number | null>(null);
  const [paused, setPaused] = createSignal<number | null>(null);
  const [rang, setRang] = createSignal(false);
  const remaining = createMemo(() => {
    const p = paused();
    if (p !== null) return p;
    const e = endsAt();
    return e === null ? length() : Math.max(0, e - now());
  });
  createMemo(() => {
    if (endsAt() !== null && paused() === null && remaining() === 0 && !rang()) {
      setRang(true);
      void post("/dev/audio/beep").catch(() => {});
      toast("Timer done", "accent");
    }
  });
  const timerRunning = () => endsAt() !== null && paused() === null && remaining() > 0;
  const timerIdle = () => endsAt() === null && paused() === null;
  const timerDone = () => endsAt() !== null && paused() === null && remaining() === 0;
  const timerOk = () => {
    if (timerDone()) {
      timerReset();
      return;
    }
    if (timerIdle()) {
      if (editing()) {
        setEditing(false);
        setEndsAt(Date.now() + length());
        setRang(false);
      } else setEditing(true);
      return;
    }
    if (timerRunning()) setPaused(remaining());
    else if (paused() !== null) {
      setEndsAt(Date.now() + paused()!);
      setPaused(null);
    }
  };
  const timerReset = () => {
    setEndsAt(null);
    setPaused(null);
    setRang(false);
  };
  const adjust = (direction: -1 | 1, fine: boolean) => {
    const step = fine ? 10_000 : 60_000;
    setLength(Math.max(10_000, Math.min(99 * 60_000, length() + direction * step)));
  };

  // Stopwatch.
  const [startedAt, setStartedAt] = createSignal<number | null>(null);
  const [elapsedBefore, setElapsedBefore] = createSignal(0);
  const [laps, setLaps] = createSignal<number[]>([]);
  const elapsed = () => elapsedBefore() + (startedAt() !== null ? now() - startedAt()! : 0);
  const lapSelection = createSelection(() => laps().length);
  const watchToggle = () => {
    if (startedAt() !== null) {
      setElapsedBefore(elapsed());
      setStartedAt(null);
    } else setStartedAt(Date.now());
  };
  const lapOrReset = () => {
    if (startedAt() !== null) setLaps(list => [elapsed(), ...list].slice(0, 20));
    else {
      setElapsedBefore(0);
      setLaps([]);
    }
  };

  useNav(event => {
    const edit = mode() === "timer" && editing();
    switch (event.key) {
      case "left":
        if (edit) adjust(-1, event.fine);
        else setMode(cycle(MODES, mode(), -1));
        return true;
      case "right":
        if (edit) adjust(1, event.fine);
        else setMode(cycle(MODES, mode(), 1));
        return true;
      case "up":
        if (mode() === "stopwatch") lapSelection.move(-1);
        else if (edit) adjust(1, false);
        return true;
      case "down":
        if (mode() === "stopwatch") lapSelection.move(1);
        else if (edit) adjust(-1, false);
        return true;
      case "ok":
        if (mode() === "timer") timerOk();
        else if (mode() === "stopwatch") watchToggle();
        return true;
      case "action":
        if (mode() === "timer" && !edit) timerReset();
        else if (mode() === "stopwatch") lapOrReset();
        return true;
      case "back":
        // Escape leaves the edit before it leaves the scene.
        if (edit) {
          setEditing(false);
          return true;
        }
        break;
    }
    return;
  });
  useHints(() => {
    switch (mode()) {
      case "clock":
        return `${KEY_LABEL.leftright} mode   ${KEY_LABEL.back} back`;
      case "timer":
        if (editing()) return `${KEY_LABEL.leftright} minutes (${KEY_LABEL.fine}: 10 s)   ${KEY_LABEL.ok} start   ${KEY_LABEL.back} done`;
        if (timerIdle()) return `${KEY_LABEL.ok} set the time   ${KEY_LABEL.leftright} mode   ${KEY_LABEL.back} back`;
        if (timerDone()) return `${KEY_LABEL.ok} clear   ${KEY_LABEL.leftright} mode   ${KEY_LABEL.back} back`;
        return `${KEY_LABEL.ok} ${timerRunning() ? "pause" : "resume"}   ${KEY_LABEL.action} reset   ${KEY_LABEL.leftright} mode`;
      case "stopwatch":
        return `${KEY_LABEL.ok} ${startedAt() !== null ? "stop" : "start"}   ${KEY_LABEL.action} ${startedAt() !== null ? "lap" : "reset"}   ${KEY_LABEL.leftright} mode   ${KEY_LABEL.updown} laps`;
    }
  });
  // Leaving the timer section ends an edit.
  createMemo(() => {
    if (mode() !== "timer") setEditing(false);
  });

  const date = () => new Date(now());
  const hhmm = () => `${two(date().getHours())}:${two(date().getMinutes())}`;
  const seconds = () => two(date().getSeconds());
  const dayLine = () => `${DAYS[date().getDay()]} ${date().getDate()} ${MONTHS[date().getMonth()]}`;
  const timerGlance = () => (timerDone() ? "done" : timerRunning() ? `${mmss(remaining())} left` : paused() !== null ? `${mmss(remaining())} paused` : `${mmss(length())} set`);
  const watchGlance = () => (startedAt() !== null ? `${lapText(elapsed())} running` : elapsed() > 0 ? `${lapText(elapsed())} stopped` : "ready");
  const timerState = () => (timerDone() ? "DONE" : timerRunning() ? "RUNNING" : paused() !== null ? "PAUSED" : editing() ? "EDIT" : "SET");
  const timerTone = () => (timerDone() ? (blink() ? "warn" : "dim") : timerRunning() ? "ok" : editing() ? "accent" : "dim");

  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <SectionTabs items={TABS} active={() => MODES.indexOf(mode())} />
      <SectionBody active={() => MODES.indexOf(mode())} count={MODES.length}>
        <Show when={mode() === "clock"}>
          <Digits value={hhmm} size="huge" x={GUTTER} y={28} />
          <Digits value={seconds} size="xl" x={GUTTER + digitsWidth("00:00", "huge") - digitsWidth("00", "xl")} y={86} tone={() => "dim"} />
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 116 }}>
            The Zero's own clock (RX8130 RTC, set by the system)
          </Text>
          <View class="absolute w-[1] bg-[#2b2148]" style={{ insetL: SIDE_X - 10, insetT: 24, height: 106 }} />
          <Text class="absolute text-sm font-bold leading-[16] text-[#fcf6ff]" style={{ insetL: SIDE_X, insetT: 28 }}>
            {dayLine()}
          </Text>
          <Text class="absolute text-sm leading-[16] text-[#cbbde2]" style={{ insetL: SIDE_X, insetT: 46 }}>
            {String(date().getFullYear())}
          </Text>
          <KeyValue label="Timer" value={timerGlance} x={SIDE_X} y={76} w={SIDE_W} tone={() => (timerRunning() ? "ok" : timerDone() ? "warn" : "dim")} />
          <KeyValue label="Watch" value={watchGlance} x={SIDE_X} y={100} w={SIDE_W} tone={() => (startedAt() !== null ? "ok" : "dim")} />
        </Show>
        <Show when={mode() === "timer"}>
          <Digits value={() => mmss(remaining())} size="huge" x={GUTTER} y={28} tone={() => (timerDone() ? (blink() ? "warn" : "ink") : editing() ? "accent" : "ink")} />
          <Chip text={timerState} tone={timerTone} x={SIDE_X} y={28} />
          <Text class="absolute text-xs leading-[14] text-[#cbbde2]" style={{ insetL: SIDE_X, insetT: 50, width: SIDE_W }}>
            {editing() ? "Setting the length" : timerIdle() ? `Set to ${mmss(length())}` : `Set for ${mmss(length())}`}
          </Text>
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: SIDE_X, insetT: 66, width: SIDE_W }}>
            {editing() ? `${KEY_LABEL.ok} starts it` : timerIdle() ? "Rings the speaker at zero" : timerDone() ? `${KEY_LABEL.ok} clears it` : `${KEY_LABEL.action} resets`}
          </Text>
          <Progress value={() => (length() > 0 ? remaining() / length() : 0)} x={GUTTER} y={100} w={CONTENT_W} h={6} tone={timerRunning() ? "ok" : "accent"} />
          <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 116 }}>
            {timerRunning() ? `Ends at ${two(new Date(endsAt()!).getHours())}:${two(new Date(endsAt()!).getMinutes())}` : editing() ? "Escape keeps the length" : ""}
          </Text>
        </Show>
        <Show when={mode() === "stopwatch"}>
          <Digits value={() => lapText(elapsed())} size="big" x={GUTTER} y={20} w={CONTENT_W} align="center" tone={() => (startedAt() !== null ? "ink" : "dim")} />
          <Chip text={() => (startedAt() !== null ? "RUNNING" : elapsed() > 0 ? "STOPPED" : "READY")} tone={() => (startedAt() !== null ? "ok" : "dim")} x={244} y={3} />
          <List items={laps} selection={lapSelection} label={lap => `Lap ${laps().length - laps().indexOf(lap)}`} value={lap => lapText(lap)} x={GUTTER} y={62} w={CONTENT_W} h={74} empty="Tab marks a lap while running" />
        </Show>
      </SectionBody>
    </View>
  );
}
