import { expect, test } from "bun:test";
import { Answer, HEADER_BYTES, answer, decodeCall, encodeCall, text, utf8 } from "../app/wire.ts";

test("a call and its answer survive the records", () => {
  const record = encodeCall(7, { url: "http://zero/dev/motion", method: "GET", timeoutMs: 8000, maxBytes: 262144 });
  const { id, call } = decodeCall(record);
  expect(id).toBe(7);
  expect(call.url).toBe("http://zero/dev/motion");
  const body = answer(7, Answer.body, utf8("héllo"));
  expect(body[4]).toBe(Answer.body);
  expect(text(body.subarray(HEADER_BYTES))).toBe("héllo");
  expect(() => encodeCall(1, { url: "http://zero/dev/" + "x".repeat(1100), method: "GET", timeoutMs: 1, maxBytes: 1 })).toThrow();
});
