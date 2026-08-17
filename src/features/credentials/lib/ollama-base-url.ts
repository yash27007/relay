/**
 * Ollama's REST API lives under `/api` (e.g. `/api/tags`, and the chat
 * endpoint `ollama-ai-provider-v2`'s `createOllama({baseURL})` builds
 * requests against). The credential form's placeholder and the stored
 * `config.baseUrl` are the bare server address (e.g.
 * `http://localhost:11434`, matching Ollama's own default docs) — this
 * appends `/api` exactly once, tolerating a value that already has it
 * (defensive) or a trailing slash.
 */
export function resolveOllamaApiBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
