// Flashlight: the panel as a lamp. The backlight goes to its maximum while
// the scene is up and returns to its value after; Enter cycles white, amber
// and red.

import { createSignal, onCleanup } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { cycle, useHints, useNav, KEY_LABEL, type Tone } from "@pocketjs/framework/compact";
import { post, request, type SystemInfo } from "../device.ts";

const COLORS = [
  { name: "white", bg: "#ffffff", ink: "#5a4d78" },
  { name: "amber", bg: "#ffd23f", ink: "#5a3b00" },
  { name: "red", bg: "#ff4d6d", ink: "#3a0010" },
] as const;

export function FlashlightScene() {
  const [color, setColor] = createSignal<(typeof COLORS)[number]>(COLORS[0]);
  const [backlight, setBacklight] = createSignal<string>("--");
  let previous: number | null = null;
  void request<SystemInfo>("/dev/system")
    .then(system => {
      if (!system.backlight) return;
      previous = system.backlight.value;
      setBacklight(`backlight ${system.backlight.max} / ${system.backlight.max}`);
      return post("/dev/system/backlight", { value: system.backlight.max });
    })
    .catch(() => setBacklight("no backlight control"));
  onCleanup(() => {
    if (previous !== null) void post("/dev/system/backlight", { value: previous }).catch(() => {});
  });
  useNav(event => {
    if (event.key === "ok" || event.key === "right") {
      setColor(cycle(COLORS, color(), 1));
      return true;
    }
    if (event.key === "left") {
      setColor(cycle(COLORS, color(), -1));
      return true;
    }
    return;
  });
  useHints(() => `${KEY_LABEL.ok} ${cycle(COLORS, color(), 1).name}   ${KEY_LABEL.back} back`);
  const tone = (): Tone => "dim";
  void tone;
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]" style={{ bgColor: color().bg }}>
      <Text class="absolute text-2xs leading-[12]" style={{ insetL: 8, insetT: 118, textColor: color().ink }}>
        {backlight()}
      </Text>
      <Text class="absolute text-2xs font-bold leading-[12]" style={{ insetL: 8, insetT: 6, textColor: color().ink }}>
        {color().name.toUpperCase()}
      </Text>
    </View>
  );
}
