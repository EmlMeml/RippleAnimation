import { afterEach, describe, expect, it, vi } from "vitest";
import { askAIStructured } from "./api";

describe("askAIStructured", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries a 502 empty AI response and returns the next valid response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: "The AI returned an empty response.", details: { finishReason: null } }),
        { status: 502 }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ response: { value: "ok" } }),
        { status: 200 }
      ));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = askAIStructured(
      "prompt",
      (value): value is { value: string } =>
        typeof value === "object" && value !== null &&
        (value as { value?: unknown }).value === "ok"
    );
    await vi.advanceTimersByTimeAsync(750);

    await expect(resultPromise).resolves.toEqual({ value: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries an OpenRouter 404 provider-routing failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "OpenRouter request failed",
        details: { error: { message: "Provider returned error", code: 404, metadata: { provider_name: "Nvidia" } } },
      }), { status: 404 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ response: { value: "ok" } }),
        { status: 200 }
      ));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = askAIStructured(
      "prompt",
      (value): value is { value: string } =>
        typeof value === "object" && value !== null &&
        (value as { value?: unknown }).value === "ok"
    );
    await vi.advanceTimersByTimeAsync(750);

    await expect(resultPromise).resolves.toEqual({ value: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
