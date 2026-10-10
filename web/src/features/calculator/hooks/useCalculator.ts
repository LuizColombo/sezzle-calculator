import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, callOperation, type CallOptions } from "../api/client";
import {
  closeAll,
  initialExpression,
  isComplete,
  reduceExpression,
  toApiString,
  type ExprToken,
  type ExpressionEvent,
} from "../model/expression";
import type { Recorder } from "./useHistory";

type TuningOptions = Pick<CallOptions, "attempts" | "baseDelayMs">;

/** Pause after the last keystroke before asking for a preview. */
export const PREVIEW_DELAY_MS = 250;

const ignore: Recorder = () => undefined;

/** A preview is only useful once there is something to compute. */
const hasOperation = (tokens: ExprToken[]) => tokens.some((t) => t.kind !== "number");

/** The expression a preview would evaluate, or null when there is nothing to preview. */
function previewExpression(tokens: ExprToken[]): string | null {
  return isComplete(tokens) && hasOperation(tokens) ? toApiString(closeAll(tokens)).text : null;
}

function toError(err: unknown): { error: ExpressionEvent & { type: "apiFailed" } } {
  if (err instanceof ApiError) {
    const position = typeof err.problem.position === "number" ? err.problem.position : undefined;
    return {
      error: {
        type: "apiFailed",
        error: { kind: "api", problem: err.problem },
        ...(position === undefined ? {} : { position }),
      },
    };
  }
  const message = err instanceof Error ? err.message : "request failed";
  return { error: { type: "apiFailed", error: { kind: "network", message } } };
}

/**
 * The calculator: the expression reducer plus the two kinds of request it
 * needs — a debounced, cancellable live preview while typing, and the
 * evaluation on "=", which is recorded in the shared history.
 */
export function useCalculator(tuning: TuningOptions = {}, record: Recorder = ignore) {
  const [state, dispatch] = useReducer(reduceExpression, initialExpression);
  const tuningRef = useRef(tuning);
  const { pending, tokens, phase } = state;

  // "=": evaluate now.
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    callOperation(
      "evaluate",
      { expression: pending.expression },
      { ...tuningRef.current, signal: controller.signal },
    ).then(
      (response) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: "resultReceived",
          expression: response.expression,
          value: response.result,
        });
        record({ expression: `${response.expression} =`, result: response.result });
      },
      (err: unknown) => {
        if (!controller.signal.aborted) dispatch(toError(err).error);
      },
    );
    return () => {
      controller.abort();
    };
  }, [pending, record]);

  // Live preview: after a pause, evaluate the expression as if "=" were pressed.
  const expression = phase === "editing" ? previewExpression(tokens) : null;
  useEffect(() => {
    if (expression === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // One attempt, no retries: a preview is a hint, not a result.
      callOperation("evaluate", { expression }, { attempts: 1, signal: controller.signal }).then(
        (response) => {
          if (!controller.signal.aborted) {
            dispatch({ type: "previewReceived", expression, value: response.result });
          }
        },
        () => undefined, // unfinished or invalid expressions are expected while typing
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [expression]);

  const send = useCallback((event: ExpressionEvent) => {
    dispatch(event);
  }, []);

  /** Re-issues "=" after a network failure. */
  const retry = useCallback(() => {
    dispatch({ type: "equals" });
  }, []);

  const preview =
    expression !== null && state.preview?.expression === expression ? state.preview.value : null;

  return { state, send, retry, preview };
}
