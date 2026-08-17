import { afterEach, describe, expect, test } from "bun:test";
import { listOllamaModels } from "./ollama";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("listOllamaModels", () => {
  test("hits {baseUrl}/api/tags and maps model names to ModelOption", async () => {
    let requestedUrl: string | undefined;
    globalThis.fetch = (async (request) => {
      requestedUrl = (request as Request).url;
      return new Response(
        JSON.stringify({ models: [{ name: "llama3.2:latest" }, { name: "mistral:latest" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const models = await listOllamaModels("http://localhost:11434", null);

    expect(requestedUrl).toBe("http://localhost:11434/api/tags");
    expect(models).toEqual([{ id: "llama3.2:latest" }, { id: "mistral:latest" }]);
  });

  test("appends /api exactly once when the stored base URL already includes it", async () => {
    let requestedUrl: string | undefined;
    globalThis.fetch = (async (request) => {
      requestedUrl = (request as Request).url;
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await listOllamaModels("http://localhost:11434/api/", null);

    expect(requestedUrl).toBe("http://localhost:11434/api/tags");
  });

  test("a non-2xx response surfaces ky's own HTTPError message", async () => {
    globalThis.fetch = (async () =>
      new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

    await expect(listOllamaModels("http://localhost:11434", "bad-key")).rejects.toThrow();
  });

  test("a connection failure (no response at all) surfaces a clear, actionable message", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:11434") });
    }) as unknown as typeof fetch;

    await expect(listOllamaModels("http://localhost:11434", null)).rejects.toThrow(
      /Couldn't reach Ollama at http:\/\/localhost:11434\/api\/tags[\s\S]*ECONNREFUSED/,
    );
  });
});
