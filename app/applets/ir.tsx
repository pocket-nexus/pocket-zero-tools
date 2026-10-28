// IR Remote: a pad of the keys learned from a remote, each sent with Enter,
// and the learning scene that captures one key, shows its timing and
// protocol, replays it and saves it under a name.

import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { ActionPad, Bars, Chip, confirm, createSelection, KeyValue, TextField, toast, useActionPad, useHints, useNav, useScenes, useSceneActive, KEY_LABEL, CONTENT_W, GUTTER, SLOT, wrap, type PadAction } from "@pocketjs/framework/compact";
import { createTopic, message, post, type Ir } from "../device.ts";

export function IrScene() {
  const scenes = useScenes();
  const active = useSceneActive();
  const ir = createTopic<Ir>("/dev/ir", 0.5, active);
  const actions = createMemo<PadAction[]>(() => {
    const data = ir.data();
    const saved: PadAction[] = (data?.signals ?? []).map(signal => ({
      label: signal.name,
      sub: signal.nec ? `NEC ${signal.nec.address}/${signal.nec.command}` : `${signal.protocol} ${signal.count}`,
      press: () => {
        void post("/dev/ir/send", { id: signal.id })
          .then(() => ir.refresh())
          .catch(error => toast(message(error), "warn"));
      },
    }));
    saved.push({
      label: "+ Learn",
      sub: data?.rx ? "a new key" : "no receiver",
      tone: "accent",
      disabled: data ? !data.rx : false,
      press: () => scenes.push({ title: "Learn a key", render: LearnScene }),
    });
    return saved;
  });
  const selection = createSelection(() => actions().length);
  useActionPad(actions, 3, selection, {
    other: event => {
      if (event.key === "action") {
        const signal = ir.data()?.signals[selection.index()];
        if (!signal) return true;
        void confirm({ title: `Delete ${signal.name}?`, text: "The learned key is removed from this pad.", action: "Delete", danger: true }).then(ok => {
          if (!ok) return;
          void post("/dev/ir/delete", { id: signal.id })
            .then(() => {
              ir.refresh();
              toast("Deleted");
            })
            .catch(error => toast(message(error), "warn"));
        });
        return true;
      }
      return;
    },
  });
  useHints(() => `${KEY_LABEL.arrows} move   ${KEY_LABEL.ok} send   ${KEY_LABEL.action} delete   ${KEY_LABEL.back} back`);
  const status = () => {
    const data = ir.data();
    if (!data) return "Waiting for the IR port";
    if (!data.tx) return "No transmitter: keys cannot be sent";
    if (data.sending) return "Sending";
    const last = data.lastSent;
    if (!last) return data.signals.length ? "Ready" : "No keys yet: learn one from a remote";
    return last.ok ? "Sent" : `Failed: ${last.error}`;
  };
  const tone = () => {
    const data = ir.data();
    if (!data || !data.tx) return "warn";
    if (data.sending) return "accent";
    return data.lastSent && !data.lastSent.ok ? "warn" : "ok";
  };
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <ActionPad actions={actions} columns={3} selection={selection} x={GUTTER} y={2} w={CONTENT_W} h={112} />
      <Chip text={() => (ir.data()?.sending ? "SENDING" : "IR")} tone={tone} x={GUTTER} y={120} />
      <Text class="absolute text-2xs leading-[12]" style={{ insetL: 44, insetT: 120, textColor: tone() === "warn" ? "#ff7fb4" : "#cbbde2" }}>
        {status()}
      </Text>
    </View>
  );
}

function LearnScene() {
  const scenes = useScenes();
  const active = useSceneActive();
  const ir = createTopic<Ir>("/dev/ir", 0.25, active);
  const captured = () => ir.data()?.captured ?? null;
  const learning = () => ir.data()?.learning ?? false;
  const start = () => {
    void post("/dev/ir/learn", { on: true })
      .then(() => ir.refresh())
      .catch(error => toast(message(error), "warn"));
  };
  start();
  onCleanup(() => {
    void post("/dev/ir/learn", { on: false }).catch(() => {});
  });
  const bars = createMemo(() => {
    const pulses = captured()?.pulses ?? [];
    const shown = pulses.slice(0, 64);
    return shown.map((d, i) => (i % 2 === 0 ? Math.min(1, d / 2500) : -Math.min(1, d / 2500)));
  });
  useNav(event => {
    switch (event.key) {
      case "ok":
        if (captured()) scenes.push({ title: "Name the key", render: NameScene });
        return true;
      case "action":
        if (captured()) {
          void post("/dev/ir/send", { captured: true })
            .then(() => toast("Replayed", "ok"))
            .catch(error => toast(message(error), "warn"));
        }
        return true;
      case "pause":
        start();
        return true;
    }
    return;
  });
  useHints(() => (captured() ? `${KEY_LABEL.ok} save   ${KEY_LABEL.action} replay   ${KEY_LABEL.pause} learn again   ${KEY_LABEL.back} back` : `Waiting for a key   ${KEY_LABEL.pause} restart   ${KEY_LABEL.back} back`));
  const state = () => (learning() ? "LISTENING" : captured() ? "CAPTURED" : ir.data() && !ir.data()!.rx ? "NO RECEIVER" : "IDLE");
  const stateTone = () => (learning() ? "accent" : captured() ? "ok" : ir.data() && !ir.data()!.rx ? "warn" : "dim");
  const nec = () => captured()?.nec ?? null;
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Chip text={state} tone={stateTone} x={GUTTER} y={4} />
      <Show
        when={captured()}
        fallback={
          <>
            <Text class="absolute text-sm font-bold leading-[16] text-[#fcf6ff]" style={{ insetL: GUTTER, insetT: 26 }}>
              Point the remote at the Zero's top edge
            </Text>
            <Text class="absolute text-xs leading-[14] text-[#cbbde2]" style={{ insetL: GUTTER, insetT: 46 }}>
              {wrap("Press one key. The receiver listens for 30 seconds; the pulses show here when a signal arrives.", SLOT.xs, CONTENT_W).join("\n")}
            </Text>
          </>
        }
      >
        <Bars values={bars} x={GUTTER} y={20} w={CONTENT_W} h={44} tone="accent" mirror />
        <KeyValue label="protocol" value={() => captured()!.protocol} x={GUTTER} y={70} w={146} />
        <KeyValue label="pulses" value={() => `${captured()!.pulses.length}`} x={GUTTER} y={86} w={146} />
        <KeyValue label="carrier" value={() => `${Math.round(captured()!.carrierHz / 1000)} kHz`} x={GUTTER} y={102} w={146} />
        <KeyValue label="address" value={() => (nec() ? `0x${nec()!.address.toString(16).toUpperCase()}` : "--")} x={166} y={70} w={148} />
        <KeyValue label="command" value={() => (nec() ? `0x${nec()!.command.toString(16).toUpperCase()}` : "--")} x={166} y={86} w={148} />
        <KeyValue label="length" value={() => `${Math.round(captured()!.pulses.reduce((a, b) => a + b, 0) / 1000)} ms`} x={166} y={102} w={148} />
      </Show>
    </View>
  );
}

function NameScene() {
  const scenes = useScenes();
  const [name, setName] = createSignal("");
  const save = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void post("/dev/ir/save", { name: trimmed })
      .then(() => {
        toast(`Saved ${trimmed}`, "ok");
        scenes.pop();
        scenes.pop();
      })
      .catch(error => toast(message(error), "warn"));
  };
  useHints(`Type a name   ${KEY_LABEL.ok} save   ${KEY_LABEL.back} back`);
  createEffect(() => {
    void name();
  });
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Text class="absolute text-xs leading-[14] text-[#cbbde2]" style={{ insetL: GUTTER, insetT: 8 }}>
        A short name for the key, as the pad shows it: Power, Vol +, Mute.
      </Text>
      <TextField value={name} active={() => true} placeholder="Key name" x={GUTTER} y={30} w={CONTENT_W} maxLength={16} onInput={setName} onSubmit={save} onCancel={() => scenes.pop()} />
    </View>
  );
}
