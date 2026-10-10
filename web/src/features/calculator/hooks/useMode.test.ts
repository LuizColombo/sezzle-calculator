import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODE_KEY, useMode } from "./useMode";

describe("useMode", () => {
  it("defaults to basic", () => {
    expect(renderHook(() => useMode()).result.current.mode).toBe("basic");
  });

  it("switches and remembers the mode", () => {
    const { result } = renderHook(() => useMode());
    act(() => {
      result.current.setMode("scientific");
    });
    expect(result.current.mode).toBe("scientific");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("scientific");
    expect(renderHook(() => useMode()).result.current.mode).toBe("scientific");
  });

  it("ignores an invalid stored value", () => {
    window.localStorage.setItem(MODE_KEY, "graphing");
    expect(renderHook(() => useMode()).result.current.mode).toBe("basic");
  });
});
