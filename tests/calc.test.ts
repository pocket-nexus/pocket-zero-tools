import { expect, test } from "bun:test";
import { evaluate } from "../app/applets/calc.ts";

test("the calculator reads an expression or refuses it", () => {
  expect(evaluate("1+2*3")).toBe(7);
  expect(evaluate("(1+2)*3")).toBe(9);
  expect(evaluate("-4/8")).toBe(-0.5);
  expect(evaluate("12*(3+4)")).toBe(84);
  expect(evaluate("1/0")).toBeNull();
  expect(evaluate("1+")).toBeNull();
  expect(evaluate("abc")).toBeNull();
  expect(evaluate("(1")).toBeNull();
  // The letter x is a direction now, not a times sign.
  expect(evaluate("2x3")).toBeNull();
});
