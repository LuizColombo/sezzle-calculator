import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/server";
import type { CalculatorEvent } from "../model/types";
import { useCalculator } from "./useCalculator";
import { useHistory } from "./useHistory";

/** The calculator with a real history, wired the way Calculator wires them. */
function renderCalculator(tuning: Parameters<typeof useCalculator>[0] = {}) {
  return renderHook(() => {
    const history = useHistory();
    return { ...useCalculator(tuning, history.add), history };
  });
}

const digit = (d: string): CalculatorEvent => ({ type: "digit", digit: d });

function sendAll(send: (e: CalculatorEvent) => void, events: CalculatorEvent[]) {
  act(() => {
    events.forEach(send);
  });
}

const onePlusTwo: CalculatorEvent[] = [
  digit("1"),
  { type: "operator", operator: "add" },
  digit("2"),
  { type: "equals" },
];

describe("useCalculator", () => {
  it("performs a binary operation through the API and records it in history", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, onePlusTwo);
    expect(result.current.state.phase).toBe("awaitingResult");
    await waitFor(() => {
      expect(result.current.state.phase).toBe("result");
    });
    expect(result.current.state.display).toBe("3");
    expect(result.current.history.entries[0]).toMatchObject({ expression: "1 + 2 =", result: "3" });
  });

  it("does not record intermediate results of a chain", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, [digit("2"), { type: "operator", operator: "add" }, digit("3")]);
    sendAll(result.current.send, [{ type: "operator", operator: "multiply" }]);
    await waitFor(() => {
      expect(result.current.state.phase).toBe("operatorChosen");
    });
    sendAll(result.current.send, [digit("4"), { type: "equals" }]);
    await waitFor(() => {
      expect(result.current.state.display).toBe("20");
    });
    expect(result.current.history.entries.map((e) => e.expression)).toEqual(["5 × 4 ="]);
  });

  it("records unary operations", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, [digit("1"), digit("6"), { type: "unary", operator: "sqrt" }]);
    await waitFor(() => {
      expect(result.current.state.display).toBe("4");
    });
    expect(result.current.history.entries[0]).toMatchObject({ expression: "√16", result: "4" });
  });

  it("records 200 + 5% once, as the final sum, not the intermediate percentage", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, [
      digit("2"),
      digit("0"),
      digit("0"),
      { type: "operator", operator: "add" },
      digit("5"),
      { type: "unary", operator: "percent" },
    ]);
    await waitFor(() => {
      expect(result.current.state.display).toBe("10");
    });
    expect(result.current.history.entries).toHaveLength(0);

    sendAll(result.current.send, [{ type: "equals" }]);
    await waitFor(() => {
      expect(result.current.state.display).toBe("210");
    });
    expect(result.current.history.entries.map((e) => e.expression)).toEqual(["200 + 10 ="]);
  });

  it("describes a standalone percentage in history", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, [digit("5"), digit("0"), { type: "unary", operator: "percent" }]);
    await waitFor(() => {
      expect(result.current.state.display).toBe("0.5");
    });
    expect(result.current.history.entries[0]).toMatchObject({ expression: "50%", result: "0.5" });
  });

  it("surfaces an API problem as the error state, without history", async () => {
    const { result } = renderCalculator();
    sendAll(result.current.send, [
      digit("1"),
      { type: "operator", operator: "divide" },
      digit("0"),
      { type: "equals" },
    ]);
    await waitFor(() => {
      expect(result.current.state.phase).toBe("error");
    });
    expect(result.current.state.error).toMatchObject({ kind: "api", problem: { status: 422 } });
    expect(result.current.history.entries).toHaveLength(0);
  });

  it("reports a network failure and retries the same calculation", async () => {
    server.use(http.post("/api/v1/add", () => HttpResponse.error()));
    const { result } = renderCalculator({ attempts: 1 });
    sendAll(result.current.send, onePlusTwo);
    await waitFor(() => {
      expect(result.current.state.error?.kind).toBe("network");
    });

    server.resetHandlers();
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.display).toBe("3");
    });
    expect(result.current.state.error).toBeNull();
  });

  it("retries a failed unary calculation", async () => {
    server.use(http.post("/api/v1/sqrt", () => HttpResponse.error()));
    const { result } = renderCalculator({ attempts: 1 });
    sendAll(result.current.send, [digit("9"), { type: "unary", operator: "sqrt" }]);
    await waitFor(() => {
      expect(result.current.state.error?.kind).toBe("network");
    });
    server.resetHandlers();
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.display).toBe("3");
    });
  });

  it("all clear abandons an in-flight calculation", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.post("/api/v1/add", async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ operation: "add", inputs: {}, result: "3" });
      }),
    );
    const { result } = renderCalculator();
    sendAll(result.current.send, onePlusTwo);
    sendAll(result.current.send, [{ type: "allClear" }]);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state.display).toBe("0");
    expect(result.current.history.entries).toHaveLength(0);
  });
});
