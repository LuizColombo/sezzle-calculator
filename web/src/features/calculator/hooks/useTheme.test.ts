import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, useTheme } from "./useTheme";

/** A controllable prefers-color-scheme media query. */
function mockSystemTheme(initial: "light" | "dark") {
  let dark = initial === "dark";
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("dark") ? dark : !dark;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    })),
  );
  return {
    set(next: "light" | "dark") {
      dark = next === "dark";
      listeners.forEach((fn) => {
        fn();
      });
    },
  };
}

const html = document.documentElement;
const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("useTheme", () => {
  beforeEach(() => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete html.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it("starts from the theme applied before first paint", () => {
    mockSystemTheme("light");
    html.dataset.theme = "dark";
    expect(renderHook(() => useTheme()).result.current.theme).toBe("dark");
  });

  it("falls back to the system theme", () => {
    mockSystemTheme("dark");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("dark");
  });

  it("toggles, applies and remembers the choice", () => {
    mockSystemTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(themeColor()).toBe("#000000");

    act(() => {
      result.current.toggle();
    });
    expect(html.dataset.theme).toBe("light");
    expect(themeColor()).toBe("#f2f2f7");
  });

  it("follows the system while the user has not chosen", () => {
    const system = mockSystemTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      system.set("dark");
    });
    expect(result.current.theme).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
  });

  it("keeps the user's choice when the system changes", () => {
    const system = mockSystemTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    act(() => {
      system.set("light");
    });
    expect(result.current.theme).toBe("dark");
  });

  it("ignores an invalid stored value", () => {
    mockSystemTheme("light");
    window.localStorage.setItem(THEME_KEY, "purple");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("light");
  });
});
