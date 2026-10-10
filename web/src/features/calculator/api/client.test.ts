import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, callOperation } from "./client";

const ok = (result: string) =>
  new Response(JSON.stringify({ operation: "add", inputs: {}, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const problem = (status: number, detail: string) =>
  new Response(JSON.stringify({ type: "x", title: "T", status, detail }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("callOperation", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sleep = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    fetchMock.mockReset();
    sleep.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts JSON to the operation path and returns the response", async () => {
    fetchMock.mockResolvedValueOnce(ok("3"));
    const res = await callOperation("add", { a: "1", b: "2" }, { sleep });
    expect(res.result).toBe("3");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/add");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ a: "1", b: "2" }));
  });

  it("throws ApiError with the problem on 4xx, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(problem(422, "division by zero"));
    await expect(callOperation("divide", { a: "1", b: "0" }, { sleep })).rejects.toMatchObject({
      name: "ApiError",
      problem: { status: 422, detail: "division by zero" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry a 500", async () => {
    fetchMock.mockResolvedValue(problem(500, ""));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a non-problem error response as a NetworkError, without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 500 }));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network failures with exponential delays, then succeeds", async () => {
    fetchMock
      .mockImplementationOnce(offline)
      .mockImplementationOnce(offline)
      .mockResolvedValueOnce(ok("3"));
    const res = await callOperation("add", { a: "1", b: "2" }, { sleep, random: () => 1 });
    expect(res.result).toBe("3");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]: unknown[]) => ms)).toEqual([300, 600]);
  });

  it.each([502, 503, 504])("retries %i and gives up after 3 attempts", async (status) => {
    fetchMock.mockImplementation(() => Promise.resolve(problem(status, "down")));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("applies full jitter and caps the delay", async () => {
    fetchMock.mockImplementation(offline);
    await expect(
      callOperation("add", { a: "1", b: "2" }, { sleep, random: () => 0.5, attempts: 6 }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(sleep.mock.calls.map(([ms]: unknown[]) => ms)).toEqual([150, 300, 600, 1000, 1000]);
  });

  it("rethrows an abort without retrying", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(
      callOperation("add", { a: "1", b: "2" }, { sleep, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when aborted during the backoff delay", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(offline);
    const abortingSleep = vi.fn(() => {
      controller.abort();
      return Promise.resolve();
    });
    await expect(
      callOperation("add", { a: "1", b: "2" }, { sleep: abortingSleep, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a success body without a string result", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: 3 }), { status: 200 }));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
