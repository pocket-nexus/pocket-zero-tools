// Keys: what the keyboard sends, as the runtime names it. The last key in
// large type, the eight before it in a list, and the modifiers held. The
// tool for checking a keymap; Escape alone leaves.

import { createSignal } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { Chip, createSelection, List, useHints, useKey, KEY_LABEL, CONTENT_W, GUTTER, SLOT, wrap } from "@pocketjs/framework/compact";

interface Seen {
  id: number;
  text: string;
  kind: string;
}

export function KeysScene() {
  const [last, setLast] = createSignal("--");
  const [log, setLog] = createSignal<Seen[]>([]);
  const [held, setHeld] = createSignal<string[]>([]);
  const [count, setCount] = createSignal(0);
  let id = 0;
  const selection = createSelection(() => log().length);
  useKey(event => {
    if (event.kind === "key") {
      if (event.key === "Escape") return;
      const modifier = ["Shift", "Control", "Alt", "Meta", "Fn", "CapsLock"].includes(event.key);
      if (modifier) setHeld(list => (event.pressed ? (list.includes(event.key) ? list : [...list, event.key]) : list.filter(k => k !== event.key)));
      if (!event.pressed) return true;
      setLast(event.key === " " ? "Space" : event.key);
      setCount(c => c + 1);
      setLog(list => [{ id: id++, text: event.key === " " ? "Space" : event.key, kind: event.repeat ? "repeat" : "down" }, ...list].slice(0, 8));
      return true;
    }
    if (event.kind === "commit") {
      setLast(event.text);
      setLog(list => [{ id: id++, text: event.text, kind: "commit" }, ...list].slice(0, 8));
      return true;
    }
    return true;
  });
  useHints(`Press keys to see their names   ${KEY_LABEL.back} back`);
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Text class="absolute text-2xs font-bold leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 4 }}>
        LAST KEY
      </Text>
      <Text class="absolute text-2xl font-bold leading-[26] text-[#fcf6ff]" style={{ insetL: GUTTER, insetT: 18, width: 150 }}>
        {last()}
      </Text>
      <Chip text={() => (held().length ? held().join("+") : "no modifier")} tone={() => (held().length ? "accent" : "dim")} x={GUTTER} y={50} />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 70, width: 150 }}>
        {wrap(`${count()} presses. Names follow KeyboardEvent.key; the Zero's Fn layer arrives as arrows and symbols.`, SLOT.tiny, 150).join("\n")}
      </Text>
      <List items={log} selection={selection} label={item => item.text} value={item => item.kind} x={166} y={2} w={CONTENT_W - 160} h={132} empty="Nothing yet" />
    </View>
  );
}
