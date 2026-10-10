import { describe, expect, it } from "vitest";
import { eventForKey } from "./keymap";

describe("eventForKey", () => {
  it.each([
    ["7", { type: "digit", digit: "7" }],
    ["0", { type: "digit", digit: "0" }],
    [".", { type: "decimal" }],
    [",", { type: "decimal" }],
    ["+", { type: "operator", op: "+" }],
    ["-", { type: "operator", op: "−" }],
    ["*", { type: "operator", op: "×" }],
    ["x", { type: "operator", op: "×" }],
    ["/", { type: "operator", op: "÷" }],
    ["^", { type: "operator", op: "^" }],
    ["(", { type: "open" }],
    [")", { type: "close" }],
    ["r", { type: "sqrt" }],
    ["%", { type: "percent" }],
    ["Enter", { type: "equals" }],
    ["=", { type: "equals" }],
    ["Escape", { type: "allClear" }],
    ["Backspace", { type: "backspace" }],
  ])("maps %s", (key, event) => {
    expect(eventForKey(key)).toEqual(event);
  });

  it.each(["a", "Shift", "Tab", " ", "ArrowLeft", "F5", "77", "Delete"])("ignores %j", (key) => {
    expect(eventForKey(key)).toBeNull();
  });
});
