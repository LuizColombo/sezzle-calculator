import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboard } from "./useKeyboard";

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("useKeyboard", () => {
  it("sends mapped keys and ignores unmapped keys and shortcuts", () => {
    const send = vi.fn();
    renderHook(() => {
      useKeyboard(send);
    });
    press("7");
    press("Enter");
    press("a");
    press("7", { ctrlKey: true });
    press("r", { metaKey: true });
    expect(send.mock.calls).toEqual([[{ type: "digit", digit: "7" }], [{ type: "equals" }]]);
  });

  it("prevents the default action of handled keys, e.g. / opening quick find", () => {
    renderHook(() => {
      useKeyboard(vi.fn());
    });
    expect(press("/").defaultPrevented).toBe(true);
    expect(press("a").defaultPrevented).toBe(false);
  });

  it("leaves Enter alone on a focused button so it activates the button", () => {
    const send = vi.fn();
    renderHook(() => {
      useKeyboard(send);
    });
    const button = document.createElement("button");
    document.body.append(button);
    const event = press("Enter", {}, button);
    expect(event.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
    button.remove();
  });

  it("ignores keys typed into editable fields", () => {
    const send = vi.fn();
    renderHook(() => {
      useKeyboard(send);
    });
    const input = document.createElement("input");
    document.body.append(input);
    press("7", {}, input);
    expect(send).not.toHaveBeenCalled();
    input.remove();
  });

  it("stops listening on unmount", () => {
    const send = vi.fn();
    const { unmount } = renderHook(() => {
      useKeyboard(send);
    });
    unmount();
    press("7");
    expect(send).not.toHaveBeenCalled();
  });
});
