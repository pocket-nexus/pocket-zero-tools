// Counter: a hand counter, the clicker a doorman or a coach holds. Enter
// (or right) adds one for each person, lap or item counted, left takes one
// back, Shift steps by ten, Tab resets after a confirmation. The count is
// kept on the Zero between runs. It takes the left of the panel; the right
// says what changed last and how much this run added.

import { createSignal } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { confirm, Digits, KeyValue, toast, useHints, useNav, KEY_LABEL, GUTTER } from "@pocketjs/framework/compact";
import { message, store } from "../device.ts";

/** The right column: the last change, this run's total, the step. */
const SIDE_X = 196;
const SIDE_W = 320 - GUTTER - SIDE_X;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function CounterScene() {
  const [count, setCount] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);
  const [last, setLast] = createSignal<{ delta: number; at: Date } | null>(null);
  const [run, setRun] = createSignal(0);
  // The store key is the tool's first name.
  void store
    .get<{ count: number }>("tally")
    .then(value => {
      if (value && typeof value.count === "number") setCount(value.count);
      setLoaded(true);
    })
    .catch(() => setLoaded(true));
  let saveQueued = false;
  const save = () => {
    if (saveQueued) return;
    saveQueued = true;
    // One write per settled value: the store is a file.
    void Promise.resolve().then(() => {
      saveQueued = false;
      return store.set("tally", { count: count() }).catch(error => toast(message(error), "warn"));
    });
  };
  const change = (delta: number) => {
    const before = count();
    setCount(c => Math.max(0, Math.min(99999, c + delta)));
    const applied = count() - before;
    if (applied !== 0) {
      setLast({ delta: applied, at: new Date() });
      setRun(r => r + applied);
    }
    save();
  };
  useNav(event => {
    switch (event.key) {
      case "ok":
      case "right":
      case "up":
        change(event.fine ? 10 : 1);
        return true;
      case "left":
      case "down":
        change(event.fine ? -10 : -1);
        return true;
      case "action":
        if (count() === 0) return true;
        void confirm({ title: "Reset the count?", text: `The count of ${count()} goes back to zero.`, action: "Reset", danger: true }).then(ok => {
          if (ok) {
            setLast({ delta: -count(), at: new Date() });
            setRun(0);
            setCount(0);
            save();
          }
        });
        return true;
    }
    return;
  });
  useHints(`${KEY_LABEL.ok} +1   ${KEY_LABEL.leftright} -1 / +1 (${KEY_LABEL.fine}: 10)   ${KEY_LABEL.action} reset   ${KEY_LABEL.back} back`);
  const text = () => String(count());
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Text class="absolute text-2xs font-bold leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 6 }}>
        COUNT
      </Text>
      <Digits value={text} size="huge" x={GUTTER} y={30} tone={() => (loaded() ? "ink" : "dim")} />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: GUTTER, insetT: 106, width: SIDE_X - 10 - GUTTER }}>
        {loaded() ? "Enter for each one you count:\npeople, laps, items" : "Loading the count"}
      </Text>
      <View class="absolute w-[1] bg-[#2b2148]" style={{ insetL: SIDE_X - 10, insetT: 6, height: 124 }} />
      <KeyValue label="Last" value={() => (last() ? `${signed(last()!.delta)} at ${hhmm(last()!.at)}` : "nothing yet")} x={SIDE_X} y={8} w={SIDE_W} tone={() => (last() ? "ink" : "dim")} />
      <KeyValue label="This run" value={() => signed(run())} x={SIDE_X} y={32} w={SIDE_W} tone={() => (run() ? "ink" : "dim")} />
      <KeyValue label="Step" value={() => `1, ${KEY_LABEL.fine} 10`} x={SIDE_X} y={56} w={SIDE_W} tone={() => "dim"} />
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: SIDE_X, insetT: 84, width: SIDE_W }}>
        {"Kept on the Zero\nbetween runs"}
      </Text>
    </View>
  );
}
