// Pieces the tools share beyond the kit: a blink signal for recording dots
// and a ring of recent readings for traces.

import { createSignal, type Accessor } from "solid-js";
import { after } from "@pocketjs/framework/clock";

/** True half a second, false half a second. */
export function createBlink(): Accessor<boolean> {
  const [on, setOn] = createSignal(true);
  const tick = () => {
    setOn(v => !v);
    after(0.5, tick);
  };
  after(0.5, tick);
  return on;
}

/** A clamped ring of the last `size` values. */
export function createHistory(size: number): { values: Accessor<number[]>; push(value: number): void; clear(): void } {
  const [values, setValues] = createSignal<number[]>(Array.from({ length: size }, () => 0));
  return {
    values,
    push: value => setValues(list => [...list.slice(1), value]),
    clear: () => setValues(Array.from({ length: size }, () => 0)),
  };
}
