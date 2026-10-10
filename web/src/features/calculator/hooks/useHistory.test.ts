import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, useHistory } from "./useHistory";

describe("useHistory", () => {
  it("starts empty and adds entries newest first", () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
    act(() => {
      result.current.add({ expression: "1 + 2 =", result: "3" });
    });
    act(() => {
      result.current.add({ expression: "√16", result: "4" });
    });
    expect(result.current.entries.map((e) => e.result)).toEqual(["4", "3"]);
    expect(result.current.entries[0]?.at).toBeTypeOf("number");
  });

  it("persists to localStorage, caps at 50 and reloads", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      for (let i = 0; i < 60; i++)
        result.current.add({ expression: `${String(i)} =`, result: String(i) });
    });
    expect(result.current.entries).toHaveLength(50);
    expect(JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]")).toHaveLength(50);

    const { result: reloaded } = renderHook(() => useHistory());
    expect(reloaded.current.entries[0]?.result).toBe("59");
  });

  it("clears memory and storage", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.add({ expression: "1 + 2 =", result: "3" });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.entries).toEqual([]);
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it("ignores corrupt or malformed storage", () => {
    window.localStorage.setItem(HISTORY_KEY, "{not json");
    expect(renderHook(() => useHistory()).result.current.entries).toEqual([]);

    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ expression: "1 =", result: "1", at: 1 }, { nope: true }, 42]),
    );
    expect(renderHook(() => useHistory()).result.current.entries).toEqual([
      { expression: "1 =", result: "1", at: 1 },
    ]);
  });

  it("keeps working in memory when storage throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.add({ expression: "1 + 2 =", result: "3" });
    });
    expect(result.current.entries).toHaveLength(1);
    setItem.mockRestore();
  });
});
