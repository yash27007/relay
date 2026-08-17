import ky, { HTTPError } from "ky";
import { resolveOllamaApiBaseUrl } from "../ollama-base-url";
import type { ModelOption } from "./types";

export async function listOllamaModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<ModelOption[]> {
  const requestUrl = `${resolveOllamaApiBaseUrl(baseUrl)}/tags`;

  let response: { models: { name: string }[] };
  try {
    response = await ky
      .get(requestUrl, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        // ky retries a connection failure (no response at all — the case
        // this catch block is mainly for) up to 2 more times with backoff
        // by default. For a "list the models in a combobox" UI call, that
        // just makes the user wait several extra seconds to see the same
        // "unreachable" error — a locally/self-hosted Ollama instance
        // being down or misconfigured isn't a transient blip worth
        // retrying the way a flaky remote API call might be.
        retry: 0,
      })
      .json<{ models: { name: string }[] }>();
  } catch (error) {
    // A non-2xx response is an HTTPError with its own clear message
    // (surfaced as-is). Anything else here means the request never got a
    // response at all — Ollama isn't running, the base URL is wrong, or
    // it's unreachable from wherever this server process runs (e.g. a
    // container/WSL boundary between this app and a host-machine Ollama).
    // ky doesn't wrap that case, so the default message is a bare "fetch
    // failed" — reword it to name the URL that failed and the likely cause.
    if (error instanceof HTTPError) {
      throw error;
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    throw new Error(
      `Couldn't reach Ollama at ${requestUrl} — is it running and is the base URL correct?` +
        (cause ? ` (${cause})` : ""),
    );
  }

  return response.models.map((model) => ({ id: model.name }));
}
