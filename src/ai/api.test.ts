import { afterEach, describe, expect, it, vi } from "vitest";
import { AIRateLimitError, askAI, askAIStructured, isAIRateLimitError } from "./api";

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

  it("recognizes a direct 429 without retrying an exhausted free-token quota", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askAIStructured("prompt", (_): _ is object => true))
      .rejects.toBeInstanceOf(AIRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recognizes a nested provider 429 even when the worker returns 502", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "OpenRouter request failed",
      details: { error: { code: 429, message: "Free tier rate limit exceeded" } },
    }), { status: 502 })));
    const error = await askAIStructured("prompt", (_): _ is object => false)
      .catch((reason: unknown) => reason);
    expect(isAIRateLimitError(error)).toBe(true);
  });

  it("propagates a nested 429 from the general fact-extraction request", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "OpenRouter request failed",
      details: { error: { code: 429, message: "Provider returned error" } },
    }), { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(askAI("fact extraction prompt")).rejects.toBeInstanceOf(AIRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
