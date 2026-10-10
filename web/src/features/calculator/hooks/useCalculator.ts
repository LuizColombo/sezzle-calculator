import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, callOperation, type ApiResponse, type CallOptions } from "../api/client";
import { initialState, reduce } from "../model/reducer";
import { OPERATOR_SYMBOL, type CalculatorEvent, type PendingCall } from "../model/types";
import { useHistory } from "./useHistory";

type TuningOptions = Pick<CallOptions, "attempts" | "baseDelayMs">;

/** Performs a pending call. Each branch is type-checked against the OpenAPI request body. */
function perform(pending: PendingCall, options: CallOptions): Promise<ApiResponse> {
  switch (pending.kind) {
    case "binary": {
      const { operator, a, b } = pending;
      return operator === "power"
        ? callOperation("power", { base: a, exponent: b }, options)
        : callOperation(operator, { a, b }, options);
    }
    case "sqrt":
      return callOperation("sqrt", { value: pending.value }, options);
    case "percent":
      // x % is x ÷ 100, i.e. 1 % of x.
      return pending.mode === "plain"
        ? callOperation("percent", { value: pending.value, percent: "1" }, options)
        : callOperation("percent", { value: pending.value, percent: pending.percent }, options);
  }
}

function historyExpression(pending: PendingCall): string {
  switch (pending.kind) {
    case "binary":
      return `${pending.a} ${OPERATOR_SYMBOL[pending.operator]} ${pending.b} =`;
    case "sqrt":
      return `√${pending.value}`;
    case "percent":
      return pending.mode === "plain"
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
    perform(pending, { ...tuningRef.current, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return;
        lastFailedRef.current = null;
        dispatch({ type: "resultReceived", result: response.result });
        // Only finished calculations are history entries: not the "5" of a
        // chain ("2 + 3 ×"), nor the "30" of "200 + 15 %" before "=".
        const finished =
          pending.kind === "binary" ? pending.then.type === "show" : pending.resume === "result";
        if (finished) {
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
