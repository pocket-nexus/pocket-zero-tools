// Metronome: a tempo on a ruler, a pendulum that crosses the panel once a
// beat, and a click from the speaker on each beat. Left and right step the
// tempo, Enter starts and stops. The tempo reads at the left, the four
// beats of the bar at the right, the pendulum and the ruler run across.

import { createSignal, Index, onCleanup } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { after } from "@pocketjs/framework/clock";
import { Chip, Digits, glide, stepValue, Tuner, useHints, useNav, KEY_LABEL, CONTENT_W, GUTTER, digitsWidth } from "@pocketjs/framework/compact";
import { post } from "../device.ts";

const TRACK_W = CONTENT_W - 24;
const BEATS = 4;
const SIDE_X = 196;

export function MetronomeScene() {
  const [bpm, setBpm] = createSignal(100);
  const [running, setRunning] = createSignal(false);
  const [beat, setBeat] = createSignal(0);
  let generation = 0;
  let bob: NodeMirror | undefined;
  let side = 0;
  const period = () => 60 / bpm();
  const tick = (mine: number) => {
    if (mine !== generation) return;
    setBeat(b => (b % 4) + 1);
    void post("/dev/audio/beep").catch(() => {});
    side = side ? 0 : 1;
    if (bob) glide(bob, "translateX", side ? TRACK_W : 0, Math.round(period() * 1000), "in-out");
    after(period(), () => tick(mine));
  };
  const start = () => {
    generation++;
    setRunning(true);
    setBeat(0);
    tick(generation);
  };
  const stop = () => {
    generation++;
    setRunning(false);
  };
  onCleanup(stop);
  useNav(event => {
    switch (event.key) {
      case "left":
        setBpm(stepValue(bpm(), -1, 2, 40, 240, event.fine, 1));
        return true;
      case "right":
        setBpm(stepValue(bpm(), 1, 2, 40, 240, event.fine, 1));
        return true;
      case "ok":
      case "pause":
        if (running()) stop();
        else start();
        return true;
    }
    return;
  });
  useHints(() => `${KEY_LABEL.leftright} tempo (${KEY_LABEL.fine}: 1)   ${KEY_LABEL.ok} ${running() ? "stop" : "start"}   ${KEY_LABEL.back} back`);
  const name = () => {
    const v = bpm();
    return v < 60 ? "Largo" : v < 76 ? "Adagio" : v < 108 ? "Andante" : v < 120 ? "Moderato" : v < 168 ? "Allegro" : "Presto";
  };
  const bpmText = () => String(bpm());
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Chip text={() => (running() ? `BEAT ${beat()}` : "STOPPED")} tone={() => (running() ? (beat() === 1 ? "accent" : "ok") : "dim")} x={GUTTER} y={4} />
      <Digits value={bpmText} size="big" x={GUTTER} y={18} />
      <Text class="absolute text-sm leading-[16] text-[#a99cc6]" style={{ insetL: GUTTER + digitsWidth(bpmText(), "big") + 4, insetT: 38 }}>
        bpm
      </Text>
      <Text class="absolute text-xs leading-[14] text-[#cbbde2]" style={{ insetL: GUTTER + 2, insetT: 58 }}>
        {name()}
      </Text>
      <View class="absolute w-[1] bg-[#2b2148]" style={{ insetL: SIDE_X - 10, insetT: 6, height: 66 }} />
      <Text class="absolute text-2xs font-bold leading-[12] text-[#8e80ac]" style={{ insetL: SIDE_X, insetT: 6 }}>
        {`BAR OF ${BEATS}`}
      </Text>
      <Index each={Array.from({ length: BEATS }, (_, i) => i + 1)}>
        {(n, i) => (
          <View
            class="absolute w-[18] h-[18] rounded-full border"
            style={{
              insetL: SIDE_X + i * 28,
              insetT: 24,
              borderColor: running() && beat() === n() ? (n() === 1 ? "#ffd23f" : "#3fd0e8") : "#5a4d78",
              bgColor: running() && beat() === n() ? (n() === 1 ? "#ffd23f" : "#3fd0e8") : "#171226",
            }}
          />
        )}
      </Index>
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: SIDE_X, insetT: 50 }}>
        {running() ? `${(60 / bpm()).toFixed(2)} s a beat` : "Enter starts"}
      </Text>
      <View class="absolute h-[2] bg-[#2b2148]" style={{ insetL: GUTTER + 12, insetT: 80, width: TRACK_W }} />
      <View ref={node => (bob = node)} class="absolute w-[10] h-[10] rounded-full" style={{ insetL: GUTTER + 7, insetT: 76, bgColor: running() ? "#ffd23f" : "#5a4d78" }} />
      <Tuner value={bpm} min={40} max={240} step={2} major={5} pxPerStep={6} decimals={0} rulerOnly x={10} y={88} w={300} h={48} />
    </View>
  );
}
