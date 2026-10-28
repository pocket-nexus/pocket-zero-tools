// Radio Explorer: the Wi-Fi networks and Bluetooth devices the Zero can
// hear, as lists with their signal, and one of them watched over repeated
// scans. "Radio" here is the built-in Wi-Fi and Bluetooth; there is no FM
// or sub-GHz receiver on the device.

import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { Chip, createSelection, cycle, Detail, List, SignalMeter, toast, useHints, useNav, useScenes, useSceneActive, KEY_LABEL, CONTENT_W, GUTTER, SectionBody, SectionTabs } from "@pocketjs/framework/compact";
import { createTopic, message, post, type BleDevice, type Network, type Radio } from "../device.ts";

const MODES = ["wifi", "ble"] as const;
type Mode = (typeof MODES)[number];
const TABS = ["WI-FI", "BLUETOOTH"];

const rssiToUnit = (rssi: number | null) => (rssi === null ? 0 : Math.max(0, Math.min(1, (rssi + 100) / 60)));

export function RadioScene() {
  const scenes = useScenes();
  const active = useSceneActive();
  const radio = createTopic<Radio>("/dev/radio", 1, active);
  const [mode, setMode] = createSignal<Mode>("wifi");
  const networks = createMemo(() => radio.data()?.wifi.networks ?? []);
  const devices = createMemo(() => radio.data()?.ble.devices ?? []);
  const wifiSelection = createSelection(() => networks().length);
  const bleSelection = createSelection(() => devices().length);
  const selection = () => (mode() === "wifi" ? wifiSelection : bleSelection);
  const scan = () => {
    void post(mode() === "wifi" ? "/dev/radio/wifi/scan" : "/dev/radio/ble/scan")
      .then(() => radio.refresh())
      .catch(error => toast(message(error), "warn"));
  };
  // The first look at a band scans it.
  let scanned: Record<Mode, boolean> = { wifi: false, ble: false };
  createEffect(() => {
    const data = radio.data();
    if (!data || !active()) return;
    const band = mode();
    const state = band === "wifi" ? data.wifi : data.ble;
    if (!scanned[band] && !state.scanning && state.t === null && !state.error) {
      scanned = { ...scanned, [band]: true };
      scan();
    }
  });
  useNav(event => {
    switch (event.key) {
      case "left":
        setMode(cycle(MODES, mode(), -1));
        return true;
      case "right":
        setMode(cycle(MODES, mode(), 1));
        return true;
      case "up":
        selection().move(-1);
        return true;
      case "down":
        selection().move(1);
        return true;
      case "action":
        scan();
        return true;
      case "ok": {
        if (mode() === "wifi") {
          const network = networks()[wifiSelection.index()];
          if (network) scenes.push({ title: network.ssid || "Hidden network", render: () => <NetworkScene bssid={network.bssid} /> });
        } else {
          const device = devices()[bleSelection.index()];
          if (device) scenes.push({ title: device.name ?? device.address, render: () => <DeviceScene address={device.address} /> });
        }
        return true;
      }
    }
    return;
  });
  useHints(() => `${KEY_LABEL.leftright} band   ${KEY_LABEL.updown} move   ${KEY_LABEL.ok} watch   ${KEY_LABEL.action} scan   ${KEY_LABEL.back} back`);
  const band = () => (mode() === "wifi" ? radio.data()?.wifi : radio.data()?.ble);
  const state = () => {
    const b = band();
    if (!b) return "WAITING";
    if (b.scanning) return "SCANNING";
    if (b.error) return "FAILED";
    const n = mode() === "wifi" ? networks().length : devices().length;
    return `${n} FOUND`;
  };
  const stateTone = () => (band()?.scanning ? "accent" : band()?.error ? "warn" : "ok");
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <SectionTabs items={TABS} active={() => MODES.indexOf(mode())} />
      <Chip text={state} tone={stateTone} x={236} y={3} />
      <Show when={band()?.error}>
        <Text class="absolute text-2xs leading-[12] text-[#ff7fb4]" style={{ insetL: GUTTER, insetT: 20 }}>
          {band()!.error}
        </Text>
      </Show>
      <SectionBody active={() => MODES.indexOf(mode())} count={MODES.length}>
        <Show when={mode() === "wifi"}>
          <List items={networks} selection={wifiSelection} label={n => n.ssid || "(hidden)"} value={n => `${n.signal}%`} detail={n => `ch ${n.chan}  ${n.freq} MHz  ${n.security}`} dot={n => (n.active ? "ok" : null)} x={GUTTER} y={18} w={CONTENT_W} h={118} empty={band()?.scanning ? "Scanning the band" : "No networks heard: Tab scans again"} />
        </Show>
        <Show when={mode() === "ble"}>
          <List items={devices} selection={bleSelection} label={d => d.name ?? d.address} value={d => (d.rssi === null ? "" : `${d.rssi} dBm`)} detail={d => (d.name ? d.address : "no name advertised")} x={GUTTER} y={18} w={CONTENT_W} h={118} empty={band()?.scanning ? "Listening for advertisements" : "No devices heard: Tab scans again"} />
        </Show>
      </SectionBody>
    </View>
  );
}

function rescanEvery(seconds: number, path: string, active: () => boolean, radio: ReturnType<typeof createTopic<Radio>>): void {
  let lastScan = 0;
  createEffect(() => {
    const data = radio.data();
    if (!data || !active()) return;
    const band = path.includes("wifi") ? data.wifi : data.ble;
    const now = Date.now();
    if (!band.scanning && now - lastScan > seconds * 1000) {
      lastScan = now;
      void post(path).catch(() => {});
    }
  });
}

function NetworkScene(props: { bssid: string }) {
  const active = useSceneActive();
  const radio = createTopic<Radio>("/dev/radio", 1, active);
  rescanEvery(10, "/dev/radio/wifi/scan", active, radio);
  const network = createMemo<Network | null>(() => radio.data()?.wifi.networks.find(n => n.bssid === props.bssid) ?? null);
  useHints(`Watching this network   ${KEY_LABEL.back} back`);
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Detail
        value={() => (network() ? `${network()!.signal}` : "--")}
        unit="% signal"
        label={network()?.active ? "CONNECTED" : "NEARBY"}
        rows={() => {
          const n = network();
          return n
            ? [
                ["BSSID", n.bssid],
                ["channel", `${n.chan} (${n.freq} MHz)`],
                ["security", n.security],
                ["band", n.freq > 3000 ? "5 GHz" : "2.4 GHz"],
              ]
            : [["state", "out of range since the last scan"]];
        }}
        x={GUTTER}
        y={4}
        w={190}
        h={130}
        tone={() => (network() ? "ink" : "dim")}
      />
      <SignalMeter value={() => (network()?.signal ?? 0) / 100} x={210} y={10} w={14} h={100} segments={20} vertical />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 232, insetT: 10 }}>
        {"Rescans every\n10 seconds"}
      </Text>
      <Chip text={() => (radio.data()?.wifi.scanning ? "SCANNING" : "IDLE")} tone={() => (radio.data()?.wifi.scanning ? "accent" : "dim")} x={232} y={40} />
    </View>
  );
}

function DeviceScene(props: { address: string }) {
  const active = useSceneActive();
  const radio = createTopic<Radio>("/dev/radio", 1, active);
  rescanEvery(8, "/dev/radio/ble/scan", active, radio);
  const device = createMemo<BleDevice | null>(() => radio.data()?.ble.devices.find(d => d.address === props.address) ?? null);
  useHints(`Watching this device   ${KEY_LABEL.back} back`);
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Detail
        value={() => (device()?.rssi != null ? `${device()!.rssi}` : "--")}
        unit="dBm"
        label={device() ? "HEARD" : "NOT HEARD"}
        rows={() => {
          const d = device();
          return d
            ? [
                ["address", d.address],
                ["name", d.name ?? "none advertised"],
                ["kind", d.address.startsWith("4") || d.address.startsWith("5") || d.address.startsWith("6") || d.address.startsWith("7") ? "random address" : "public address"],
              ]
            : [["state", "silent since the last scan"]];
        }}
        x={GUTTER}
        y={4}
        w={190}
        h={130}
        tone={() => (device() ? "ink" : "dim")}
      />
      <SignalMeter value={() => rssiToUnit(device()?.rssi ?? null)} x={210} y={10} w={14} h={100} segments={20} vertical />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: 232, insetT: 10 }}>
        {"Advertisements come\nand go: one silent scan\nis not an absence"}
      </Text>
      <Chip text={() => (radio.data()?.ble.scanning ? "SCANNING" : "IDLE")} tone={() => (radio.data()?.ble.scanning ? "accent" : "dim")} x={232} y={52} />
    </View>
  );
}
