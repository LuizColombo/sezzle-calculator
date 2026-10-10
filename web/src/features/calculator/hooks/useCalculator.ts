import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, callOperation, type CallOptions, type OperationName } from "../api/client";
import { initialState, reduce } from "../model/reducer";
import { OPERATOR_SYMBOL, type CalculatorEvent, type PendingCall } from "../model/types";
import { useHistory } from "./useHistory";

type TuningOptions = Pick<CallOptions, "attempts" | "baseDelayMs">;

function requestFor(pending: PendingCall): { name: OperationName; inputs: Record<string, string> } {
  switch (pending.kind) {
    case "binary":
      return pending.operator === "power"
        ? { name: "power", inputs: { base: pending.a, exponent: pending.b } }
        : { name: pending.operator, inputs: { a: pending.a, b: pending.b } };
    case "sqrt":
      return { name: "sqrt", inputs: { value: pending.value } };
    case "percent":
      return { name: "percent", inputs: { value: pending.value, percent: pending.percent } };
  }
}

function historyExpression(pending: PendingCall): string {
  switch (pending.kind) {
    case "binary":
      return `${pending.a} ${OPERATOR_SYMBOL[pending.operator]} ${pending.b} =`;
    case "sqrt":
      return `√${pending.value}`;
    case "percent":
      return pending.percent === "1"
        ? `${pending.value}%`
        : `${pending.percent}% of ${pending.value}`;
  }
}

/** The key press that re-issues a failed calculation from the restored state. */
function retryEventFor(pending: PendingCall): CalculatorEvent {
  switch (pending.kind) {
    case "binary":
      return pending.then.type === "chain"
        ? { type: "operator", operator: pending.then.nextOperator }
        : { type: "equals" };
    case "sqrt":
      return { type: "unary", operator: "sqrt" };
    case "percent":
      return { type: "unary", operator: "percent" };
  }
}

/**
 * Owns the calculator state. Whenever the reducer records a pending call,
 * this hook performs it against the API, feeds the outcome back to the
 * reducer, and adds shown results to the history.
 */
export function useCalculator(tuning: TuningOptions = {}) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const { entries, add, clear } = useHistory();
  const tuningRef = useRef(tuning);
  const lastFailedRef = useRef<PendingCall | null>(null);

  const { pending } = state;

  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    const { name, inputs } = requestFor(pending);

    callOperation(name, inputs, { ...tuningRef.current, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return;
        lastFailedRef.current = null;
        dispatch({ type: "resultReceived", result: response.result });
        // Intermediate results of a chain ("2 + 3 ×") are not history entries.
        if (pending.kind !== "binary" || pending.then.type === "show") {
          add({ expression: historyExpression(pending), result: response.result });
        }
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError) {
          lastFailedRef.current = null;
          dispatch({ type: "apiFailed", error: { kind: "api", problem: err.problem } });
        } else {
          lastFailedRef.current = pending;
          const message = err instanceof Error ? err.message : "request failed";
          dispatch({ type: "apiFailed", error: { kind: "network", message } });
        }
      },
    );

    // A newer calculation or all clear supersedes this one.
    return () => {
      controller.abort();
    };
  }, [pending, add]);

  const send = useCallback((event: CalculatorEvent) => {
    dispatch(event);
  }, []);

  /** Re-issues the calculation that last failed on the network. */
  const retry = useCallback(() => {
    if (lastFailedRef.current) dispatch(retryEventFor(lastFailedRef.current));
  }, []);

  return { state, send, retry, history: { entries, clear } };
}
