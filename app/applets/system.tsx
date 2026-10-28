// System: the battery and the machine at a glance, and the two values the
// panel adjusts in place: brightness and volume.

import { createMemo } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createSelection, stepValue, toast, useHints, useValueRows, ValueRows, useSceneActive, KEY_LABEL, CONTENT_W, GUTTER, bytes, clock, type ValueRow } from "@pocketjs/framework/compact";
import { createTopic, message, post, type Battery, type SystemInfo } from "../device.ts";

export function SystemScene() {
  const active = useSceneActive();
  const system = createTopic<SystemInfo>("/dev/system", 2, active);
  const battery = createTopic<Battery>("/dev/battery", 5, active);
  const setBacklight = (value: number) => {
    void post("/dev/system/backlight", { value })
      .then(() => system.refresh())
      .catch(error => toast(message(error), "warn"));
  };
  const setVolume = (value: number) => {
    void post("/dev/system/volume", { value })
      .then(() => system.refresh())
      .catch(error => toast(message(error), "warn"));
  };
  const rows = createMemo<ValueRow[]>(() => {
    const s = system.data();
    const b = battery.data();
    const backlight = s?.backlight ?? null;
    const step = backlight ? Math.max(1, Math.round(backlight.max / 16)) : 16;
    return [
      { label: "Battery", value: () => (b?.percent != null ? `${b.percent}%  ${b.status}` : b ? b.status : "--"), tone: () => (b?.percent != null && b.percent < 15 ? "warn" : "ink") },
      { label: "Cell", value: () => (b?.voltage != null ? `${b.voltage.toFixed(2)} V  ${b.current != null ? `${b.current >= 0 ? "+" : ""}${b.current.toFixed(2)} A` : ""}` : "--") },
      { label: "Power", value: () => (b?.power != null ? `${Math.abs(b.power).toFixed(2)} W ${b.power < 0 ? "out" : "in"}` : "--") },
      { label: "Battery temp", value: () => (b?.temp != null ? `${b.temp.toFixed(1)} C` : "--") },
      {
        label: "Brightness",
        value: () => (backlight ? `${Math.round((backlight.value / backlight.max) * 100)}%` : "--"),
        adjust: backlight ? (direction, fine) => setBacklight(Math.round(stepValue(backlight.value, direction, step, 1, backlight.max, fine, Math.max(1, Math.round(step / 4))))) : undefined,
        disabled: !backlight,
      },
      {
        label: "Volume",
        value: () => (s?.volume != null ? `${s.volume}%` : "--"),
        adjust: s?.volume != null ? (direction, fine) => setVolume(Math.round(stepValue(s.volume!, direction, 5, 0, 100, fine, 1))) : undefined,
        disabled: s?.volume == null,
      },
      { label: "Test the speaker", value: () => "beep", press: () => void post("/dev/audio/beep").catch(error => toast(message(error), "warn")) },
      { label: "Wi-Fi", value: () => (s?.wifi.ssid ? `${s.wifi.ssid}${s.wifi.rssi != null ? `  ${s.wifi.rssi} dBm` : ""}` : "not connected"), tone: () => (s?.wifi.ssid ? "ink" : "dim") },
      { label: "Address", value: () => s?.ip ?? "--" },
      { label: "Host", value: () => s?.hostname ?? "--" },
      { label: "Up", value: () => (s ? clock(s.uptime) : "--") },
      { label: "Load", value: () => (s ? s.load.map(v => v.toFixed(2)).join("  ") : "--") },
      { label: "Memory", value: () => (s ? `${s.mem.used} / ${s.mem.total} MB` : "--"), tone: () => (s && s.mem.total - s.mem.used < 30 ? "warn" : "ink") },
      { label: "Disk", value: () => (s?.disk ? `${bytes(s.disk.used)} / ${bytes(s.disk.total)}` : "--") },
      { label: "CPU temp", value: () => (s?.cpuTemp != null ? `${s.cpuTemp.toFixed(1)} C` : "--"), tone: () => (s?.cpuTemp != null && s.cpuTemp > 70 ? "warn" : "ink") },
    ];
  });
  const selection = createSelection(() => rows().length);
  useValueRows(rows, selection);
  useHints(() => {
    const row = rows()[selection.index()];
    if (row?.adjust && !row.disabled) return `${KEY_LABEL.leftright} adjust (${KEY_LABEL.fine}: fine)   ${KEY_LABEL.updown} move   ${KEY_LABEL.back} back`;
    if (row?.press) return `${KEY_LABEL.ok} ${row.value()}   ${KEY_LABEL.updown} move   ${KEY_LABEL.back} back`;
    return `${KEY_LABEL.updown} move   ${KEY_LABEL.back} back`;
  });
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <ValueRows rows={rows} selection={selection} x={GUTTER} y={2} w={CONTENT_W} h={132} />
    </View>
  );
}
