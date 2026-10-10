import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "./HistoryPanel";

const entries = [
  { expression: "1 + 2 =", result: "3", at: 2 },
  { expression: "√16", result: "4", at: 1 },
];

const props = { open: true, entries, onRecall: vi.fn(), onClear: vi.fn(), onClose: vi.fn() };

describe("HistoryPanel", () => {
  it("renders nothing while closed", () => {
    render(<HistoryPanel {...props} open={false} />);
    expect(screen.queryByRole("complementary", { name: "History" })).not.toBeInTheDocument();
  });

  it("lists entries newest first and recalls a result", async () => {
    const onRecall = vi.fn();
    const onClose = vi.fn();
    render(<HistoryPanel {...props} onRecall={onRecall} onClose={onClose} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1 + 2 =3");
    await userEvent.click(screen.getByRole("button", { name: /1 \+ 2 =.*3/ }));
    expect(onRecall).toHaveBeenCalledWith("3");
    expect(onClose).toHaveBeenCalled();
  });

  it("formats long results like the display", () => {
    render(<HistoryPanel {...props} entries={[{ expression: "x =", result: "1234567", at: 1 }]} />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("asks for confirmation before clearing", async () => {
    const onClear = vi.fn();
    render(<HistoryPanel {...props} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Clear all history" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("drops the confirmation after a few seconds", () => {
    vi.useFakeTimers();
    try {
      render(<HistoryPanel {...props} />);
      act(() => {
        screen.getByRole("button", { name: "Clear" }).click();
      });
      expect(screen.getByRole("button", { name: "Clear all history" })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole("button", { name: "Clear all history" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes on Escape without letting the key reach the calculator", () => {
    const onClose = vi.fn();
    const calculatorKeys = vi.fn();
    window.addEventListener("keydown", calculatorKeys);
    render(<HistoryPanel {...props} onClose={onClose} />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalled();
    expect(calculatorKeys).not.toHaveBeenCalled();
    window.removeEventListener("keydown", calculatorKeys);
  });

  it("shows an empty state without a clear button", () => {
    render(<HistoryPanel {...props} entries={[]} />);
    expect(screen.getByText(/no calculations yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
