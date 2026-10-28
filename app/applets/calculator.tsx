// Calculator: digits from the keyboard, operators on the screen. The pad on
// the right holds the operators round `=`: × above, ÷ below, − to the left,
// + to the right, ( ) . and DEL in the corners. FXZC move over the pad,
// Enter presses the focused key, and the focus comes back to `=` after each
// key, so an operator is one direction and Enter, and the next Enter
// evaluates; an operator on an empty line continues from the last result.
// The symbols the keyboard's sym layer types are taken too.
// The left column holds the last three lines, each expression with its
// result at the right, the expression being typed, and the result in large
// digits. Backspace deletes; Escape clears a line before it leaves.

import { createSignal, Index } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { ActionPad, createSelection, Digits, digitsWidth, useActionPad, useHints, useKey, KEY_LABEL, GUTTER, ellipsize, measure, SLOT, type PadAction } from "@pocketjs/framework/compact";
import { evaluate } from "./calc.ts";
import { createBlink } from "../ui.tsx";

/** The left column: history, the expression, the result. */
const LEFT_W = 196;
const PAD_X = GUTTER + LEFT_W + 8;
const PAD_W = 320 - GUTTER - PAD_X;
/** The pad's `=`, where the focus rests. */
const EQUALS = 4;

/** The expression as written (`*`, `/`, `-`) and as shown. */
const shown = (expression: string) => expression.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");

const format = (value: number): string => {
  const text = Math.abs(value) >= 1e12 || (Math.abs(value) < 1e-6 && value !== 0) ? value.toExponential(4) : String(Number(value.toFixed(8)));
  return text.length > 14 ? value.toPrecision(10) : text;
};

export function CalculatorScene() {
  const [line, setLine] = createSignal("");
  const [result, setResult] = createSignal("0");
  const [bad, setBad] = createSignal(false);
  const [history, setHistory] = createSignal<{ expression: string; shown: string }[]>([]);
  const blink = createBlink();
  const accept = (ch: string) => /^[0-9+\-*/().]$/.test(ch);
  // An operator on an empty line continues from the last result, as a
  // calculator does: `= 42`, then `× 4` is `42×4`.
  const type = (text: string) => {
    const continues = line() === "" && /^[+\-*/]$/.test(text) && history().length > 0 && !bad();
    setLine(l => ((continues ? result() : "") + l + text).slice(0, 40));
    setBad(false);
  };
  const evaluateLine = () => {
    const text = line().trim();
    if (!text) return;
    const value = evaluate(text);
    if (value === null) {
      setBad(true);
      return;
    }
    setBad(false);
    const answer = format(value);
    setResult(answer);
    setHistory(list => [{ expression: text, shown: answer }, ...list].slice(0, 3));
    setLine("");
  };
  const removeLast = () => {
    setLine(l => l.slice(0, -1));
    setBad(false);
  };
  const selection = createSelection(() => 9, EQUALS);
  // Each key brings the focus back to `=`.
  const key = (label: string, text: string, tone?: PadAction["tone"]): PadAction => ({
    label,
    tone,
    press: () => {
      type(text);
      selection.set(EQUALS);
    },
  });
  const pad: PadAction[] = [
    key("(", "("),
    key("×", "*", "accent"),
    key(")", ")"),
    key("−", "-", "accent"),
    { label: "=", tone: "ok", press: evaluateLine },
    key("+", "+", "accent"),
    key(".", "."),
    key("÷", "/", "accent"),
    {
      label: "DEL",
      press: () => {
        removeLast();
        selection.set(EQUALS);
      },
    },
  ];
  useActionPad(() => pad, 3, selection, { other: event => (event.key === "action" ? (setHistory([]), true) : undefined) });
  useKey(event => {
    if (event.kind === "commit") {
      const text = [...event.text].filter(accept).join("");
      if (text) type(text);
      return true;
    }
    if (event.kind !== "key" || !event.pressed) return;
    const name = event.key;
    if (name === "Backspace") {
      removeLast();
      return true;
    }
    if (name === "Control+u") {
      setLine("");
      return true;
    }
    if (name === "Escape" && line().length > 0) {
      setLine("");
      setBad(false);
      return true;
    }
    if (accept(name)) {
      type(name);
      return true;
    }
    return;
  });
  useHints(() => `${KEY_LABEL.arrows} pick   ${KEY_LABEL.ok} ${pad[selection.index()]!.label}   0-9 type   ${KEY_LABEL.action} clear history   ${KEY_LABEL.back} ${line() ? "clear" : "back"}`);
  const resultText = () => (bad() ? "Error" : result());
  const resultSize = () => (digitsWidth(resultText(), "big") <= LEFT_W ? "big" : digitsWidth(resultText(), "xxl") <= LEFT_W ? "xxl" : "xl");
  const lineText = () => (line() ? ellipsize(shown(line()), SLOT.sm, LEFT_W - 16) : "");
  const lineW = () => Math.ceil(measure(lineText(), SLOT.sm));
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Index each={[2, 1, 0]}>
        {(slot, i) => {
          const entry = () => history()[slot()];
          const latest = slot() === 0;
          const font = latest ? SLOT.xs : SLOT.tiny;
          const resultText = () => (entry() ? `= ${entry()!.shown}` : "");
          const resultW = () => Math.ceil(measure(resultText(), font));
          const y = 4 + i * 12;
          return (
            <>
              <Text class={latest ? "absolute text-xs leading-[14] text-[#cbbde2]" : "absolute text-2xs leading-[12] text-[#8e80ac]"} style={{ insetL: GUTTER, insetT: y }}>
                {entry() ? ellipsize(shown(entry()!.expression), font, LEFT_W - resultW() - 8) : ""}
              </Text>
              <Text class={latest ? "absolute text-xs leading-[14] text-[#fcf6ff]" : "absolute text-2xs leading-[12] text-[#a99cc6]"} style={{ insetL: GUTTER + LEFT_W - resultW(), insetT: y }}>
                {resultText()}
              </Text>
            </>
          );
        }}
      </Index>
      <View class="absolute rounded-sm bg-[#231b3b] border" style={{ insetL: GUTTER, insetT: 48, width: LEFT_W, height: 22, borderColor: bad() ? "#ff7fb4" : line() ? "#ffd23f" : "#3a2d5c" }}>
        <Text class="absolute text-sm leading-[22]" style={{ insetL: 6, insetT: 0, textColor: line() ? "#fcf6ff" : "#8e80ac" }}>
          {line() ? lineText() : "Type a number"}
        </Text>
        <View class="absolute w-[2] h-[14] bg-[#ffd23f]" style={{ insetL: 6 + lineW() + 1, insetT: 4, opacity: line() && blink() ? 1 : 0 }} />
      </View>
      <Digits value={resultText} size={resultSize()} x={GUTTER} w={LEFT_W} align="right" y={80} tone={() => (bad() ? "warn" : "ink")} />
      <View class="absolute w-[1] bg-[#2b2148]" style={{ insetL: PAD_X - 5, insetT: 6, height: 124 }} />
      <ActionPad actions={() => pad} columns={3} selection={selection} x={PAD_X} y={5} w={PAD_W} h={126} gap={4} />
    </View>
  );
}
