import type { components, paths } from "./schema.gen";

export type Problem = components["schemas"]["Problem"];
export type ApiResponse = components["schemas"]["Response"];

/** "add" | "subtract" | … — derived from the OpenAPI paths, so it cannot drift. */
export type OperationName = {
  [P in keyof paths]: P extends `/api/v1/${infer Name}`
    ? paths[P] extends { post: unknown }
      ? Name
      : never
    : never;
}[keyof paths];

/** The JSON body an operation expects, e.g. { base: string; exponent: string } for "power". */
export type RequestBody<N extends OperationName> =
  paths[`/api/v1/${N}`]["post"]["requestBody"]["content"]["application/json"];

/** The API answered with a Problem Details body (4xx/5xx other than 502–504). */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }
}

/** The API could not be reached, or answered with something that is not the contract. */
export class NetworkError extends Error {
  override readonly name = "NetworkError";
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Total attempts, including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Gateway errors are transient by nature; everything else is an answer. */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

/** Waits for `wait`, but rejects as soon as `signal` aborts. */
function abortable(wait: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return wait;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    wait.then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * POSTs an operation to the API.
 *
 * Network failures and 502/503/504 are retried with exponential backoff and
 * full jitter (delay = random × min(max, base × 2^n)). Any other response is
 * final: a Problem Details body becomes an ApiError. Aborting the signal stops
 * immediately, including during a backoff delay.
 */
export async function callOperation<N extends OperationName>(
  name: N,
  inputs: RequestBody<N>,
  options: CallOptions = {},
): Promise<ApiResponse> {
  const {
    signal,
    attempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 2000,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let lastFailure = "request failed";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await abortable(
        sleep(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))),
        signal,
      );
    }

    let response: Response;
    try {
      response = await fetch(`/api/v1/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, application/problem+json",
        },
        body: JSON.stringify(inputs),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      lastFailure = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (response.ok) return readResult(response);
    if (RETRYABLE_STATUS.has(response.status)) {
      lastFailure = `HTTP ${String(response.status)}`;
      continue;
    }
    const problem = await readProblem(response);
    if (problem) throw new ApiError(problem);
    throw new NetworkError(`unexpected HTTP ${String(response.status)} response`);
  }
  throw new NetworkError(lastFailure);
}

async function readResult(response: Response): Promise<ApiResponse> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as ApiResponse).result === "string"
  ) {
    return body as ApiResponse;
  }
  throw new NetworkError("unexpected response body");
}

async function readProblem(response: Response): Promise<Problem | null> {
  if (!(response.headers.get("Content-Type") ?? "").includes("json")) return null;
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "status" in body && "title" in body) {
    return body as Problem;
  }
  return null;
}
