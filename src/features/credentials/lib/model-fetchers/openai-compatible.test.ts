import { afterEach, describe, expect, test } from "bun:test";
import { fetchOpenAiCompatibleModels } from "./openai-compatible";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchOpenAiCompatibleModels", () => {
  test("returns chat models, filtering out known non-chat model ids", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o" },
            { id: "text-embedding-3-small" },
            { id: "whisper-1" },
            { id: "dall-e-3" },
            { id: "tts-1" },
            { id: "omni-moderation-latest" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const models = await fetchOpenAiCompatibleModels("https://api.openai.com/v1", "sk-test");
    expect(models).toEqual([{ id: "gpt-4o" }]);
  });

  test("sends the API key as a Bearer token", async () => {
    // ky constructs a real `Request` (headers merged in) and calls
    // `fetch(request, options)` — the first argument is that Request, not
    // a bare URL string, and its headers live on `request.headers`
    // (a `Headers` instance), not on the second argument.
    let capturedAuth: string | null = null;
    globalThis.fetch = (async (request) => {
      capturedAuth = (request as Request).headers.get("Authorization");
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await fetchOpenAiCompatibleModels("https://api.groq.com/openai/v1", "gsk-test");
    expect(capturedAuth).toBe("Bearer gsk-test");
  });

  test("rejects when the response is non-2xx", async () => {
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;

    await expect(
      fetchOpenAiCompatibleModels("https://api.openai.com/v1", "bad-key"),
    ).rejects.toThrow();
  });
});
