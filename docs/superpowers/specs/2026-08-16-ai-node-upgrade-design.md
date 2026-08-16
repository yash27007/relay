# AI Node Upgrade — Design Spec

Date: 2026-08-16
Status: Approved for planning
Scope: dynamic per-provider model selection, three new generation
parameters (temperature, max tokens, JSON mode), and four new AI
providers (DeepSeek, Mistral, Moonshot/Kimi, Ollama) across every AI node
— the four existing single-shot provider nodes (OpenAI/Anthropic/Gemini/
Groq), the new providers being added alongside them, and the Agent node.
Explicitly excludes: server-side/cross-session model-list caching (client
cache only), per-model capability validation (e.g. refusing to enable JSON
mode for a model that doesn't support it), and structured output with a
user-supplied schema (`generateObject`) — JSON mode only asks the provider
for a JSON-shaped string, it doesn't validate or type it.

## Context

Every AI node in Relay today — the 4 single-shot provider nodes sharing
`createAiExecutor`/`createAiNode`
(`src/features/workflows/nodes/executions/components/ai/`), and the Agent
node (`.../components/agent/`) — hardcodes its model as a literal string
inside its `createModel` call (e.g. `createOpenAI({ apiKey })("gpt-4o-mini")`)
and calls `generateText` with no generation parameters beyond
`system`/`prompt`/`tools`. Credentials are a single encrypted string
(`Credential.value`), looked up by `(userId, type)` via
`prisma.credential.findFirst`. This spec adds model choice, three
generation parameters, and net-new providers on top of that shape without
changing its trust boundaries: every credential lookup and decryption
still happens server-side, scoped to `ctx.userId`/the workflow's trusted
`userId`, exactly as today.

## New providers

| Provider | Package | Models endpoint | Auth |
|---|---|---|---|
| DeepSeek | `@ai-sdk/deepseek` | `GET api.deepseek.com/v1/models` (OpenAI-compatible) | API key |
| Mistral | `@ai-sdk/mistral` | `GET api.mistral.ai/v1/models` | API key |
| Moonshot/Kimi | `@ai-sdk/moonshotai` | `GET api.moonshot.ai/v1/models` (OpenAI-compatible) | API key |
| Ollama | `ollama-ai-provider-v2` (community) | `GET {baseUrl}/api/tags` | Base URL + optional key |

Existing OpenAI/Anthropic/Gemini/Groq keep their current SDKs; each has
(or exposes an OpenAI-compatible) models-list endpoint already. Exact
package versions and endpoint response shapes are pinned during
implementation against each package's actual installed types — the table
above is the researched direction, not a promise that every field name
survives contact with the real SDK.

`CredentialType` and `NodeType` (both Prisma enums) each gain four members:
`DEEPSEEK`, `MISTRAL`, `MOONSHOT`, `OLLAMA`. Additive only, matching this
branch's existing migration pattern (e.g. `AGENT` added to `NodeType`
earlier with no data-loss warning).

## Ollama is a different shape of provider

Ollama has no fixed hosted endpoint — it's typically self-hosted
(`http://localhost:11434` by default) or, for Ollama Cloud, a hosted
endpoint with its own API key. Two things follow:

1. **The server, not the browser, makes these calls.** Node executors and
   the model-listing tRPC procedure both run server-side. A `baseUrl` of
   `http://localhost:11434` only resolves correctly if the *app server*
   can reach it — true in local dev (both processes on the same laptop)
   or a self-hosted Relay deployment, not true for a hosted SaaS instance
   reaching into an end user's laptop. The Ollama credential form makes
   this explicit: a required **Base URL** field (default placeholder
   `http://localhost:11434`, fully editable), so pointing it at a
   self-hosted box, a tunnel, or `https://ollama.com` (Cloud) is the
   user's own choice, not something the app tries to infer.
2. **Credentials need structured, non-secret config, not just a secret.**
   `Credential.value` is currently a single encrypted string, always a
   secret. Ollama needs a base URL (not secret, must stay a plain string
   for e.g. `ky` to use directly) alongside an *optional* secret (Ollama
   Cloud requires an API key; a local instance usually doesn't).

## Credential schema: `config: Json?`

```prisma
model Credential {
  id        String         @id @default(cuid())
  name      String
  value     String?
  config    Json?
  type      CredentialType
  userId    String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([userId, type])
  @@map("credential")
}
```

`value` becomes nullable (Ollama without an API key has none to store —
storing `encrypt("")` would be actively misleading, implying a secret
exists). `config` holds non-secret structured data; for every provider
except Ollama it stays `null`. For Ollama, `config = { baseUrl: string }`.

This is a real, if small, migration:
`value String` → `value String?` is additive (no existing row loses data,
NOT NULL is simply relaxed), and `config Json?` is a new nullable column.
No backfill needed — every existing credential row already has a `value`
and no `config`, which is exactly the shape this migration produces for
them.

The `apiKeys.create` tRPC input and the `ApiKeyDialog` form both become
provider-aware: every existing provider still shows a required "API Key"
field only; Ollama shows "Base URL" (required) + "API Key" (optional).
`apiKeys.create`'s Zod input uses a discriminated union on `type` so a
non-Ollama submission can't accidentally omit `value`, and an Ollama
submission can't accidentally omit `config.baseUrl`.

`value` moving from `String` to `String?` changes its TypeScript type
everywhere a `Credential` row is read, not just in Ollama's path — every
existing executor's `decrypt(credential.value)` call needs a guard for
`null` even though app-level validation means only a passwordless Ollama
row can ever produce one today. This is a small, mechanical addition to
each existing provider executor (same shape as the existing
"credential not found" `NonRetriableError` guard), tracked as its own
plan task rather than folded silently into unrelated tasks.

## Model-fetching subsystem

One fetcher module per provider,
`src/features/credentials/lib/model-fetchers/<provider>.ts`, each
exporting a function of shape `(credential: { value, config }) => Promise<{ id: string; label?: string }[]>`,
using `ky` (already the HTTP client `HttpRequestExecutor` uses) against
that provider's REST endpoint. A small registry dispatches by
`CredentialType`, mirroring the existing `executor-registry.ts` pattern.

Exposed as a new protected tRPC procedure,
`credentials.apiKeys.listModels({ credentialId })`:
looks up the credential scoped to `ctx.auth.user.id` (never a bare
client-supplied id), decrypts `value` if present, dispatches to the
matching fetcher, and returns the list — or throws a `TRPCError` carrying
a human-readable reason (bad key, network failure, non-2xx response) that
the dialog surfaces inline rather than crashing.

OpenAI's raw `/v1/models` response includes non-chat models (embeddings,
`whisper-*`, `tts-*`, `dall-e-*`, moderation models) — filtered out by a
small denylist of id substrings before returning. Every other provider's
models endpoint is chat-models-only already, so no filtering needed there.

**Caching:** client-side only, via React Query's default cache (the same
mechanism `useApiKeysByType` already relies on) with roughly an hour's
`staleTime`, plus a manual "refresh" affordance in the dialog. No new
server-side storage.

## Dialog changes

Applies to the shared `ai-dialog.tsx` factory (all single-shot provider
nodes) **and** the Agent's `dialog.tsx`, per explicit scope decision —
both get the same four additions, in the same relative position (Model
directly above System Prompt):

- **Model** — a searchable combobox (shadcn `Command` + `Popover`, not a
  strict `Select`), populated via
  `useQuery(trpc.credentials.apiKeys.listModels.queryOptions(...))`,
  enabled once a credential is chosen. Loading state while fetching. On
  fetch error, shows the reason inline and still accepts free-text entry
  — a stale/failed fetch or a brand-new model id not yet reflected by the
  provider's listing never blocks saving the node.
- **Temperature** — shadcn `Slider`, range 0.0–2.0, step 0.1, default 0.7.
- **Max Tokens** — number input, optional; blank means "use the provider's
  default", not zero.
- **JSON mode** — `Switch`. Off by default.

## Executors

`createAiExecutor` (shared by every single-shot node) and `AgentExecutor`
both change their `createModel` signature from `(apiKey) => LanguageModel`
to `(apiKey, model) => LanguageModel`, reading `data.model` and falling
back to today's hardcoded default (e.g. `"gpt-4o-mini"` for OpenAI) when a
node predates this feature — so nothing already saved on the canvas
breaks. `temperature` and `maxOutputTokens` (the `generateText` v6
parameter name — confirmed against the installed `ai` package's types
during implementation) are threaded straight through when present.

JSON mode is implemented with `ai`'s own provider-agnostic mechanism —
`generateText`'s `output` parameter, set to `Output.json()` (imported as
`import { Output } from "ai"`) when the toggle is on, `undefined`
otherwise. This is the AI SDK's built-in "unstructured JSON generation"
mode: no schema required (that's `Output.object()`, explicitly out of
scope — see above), and the SDK — not this codebase — handles whichever
provider-specific mechanism makes a given model actually return JSON.
`result.text` is populated the same way regardless of `output` mode (a
plain `string`, confirmed against the installed package's
`GenerateTextResult` type), so this doesn't require a `providerOptions`
passthrough or any per-provider branching. If a chosen model doesn't
actually support JSON generation, that surfaces as a normal provider-side
execution error, the same way an invalid model name or a malformed
request already does — this spec doesn't add per-model capability
validation (see Explicitly excludes above).

Output contract is unchanged: every executor still returns
`{ context: { ...context, [variableName]: { text } } }`. JSON mode
changes what shape of string the model puts *into* `.text` — a
JSON-mode call still produces text output — it doesn't add a new field,
so nothing downstream that already does `{{myAi.text}}` needs to change.

## New node registration

DeepSeek, Mistral, and Moonshot follow the existing
`createAiNode`/`createAiExecutor` factory exactly the way Groq does today
— each a ~10-line `node.tsx` + `executor.ts` pair. Ollama needs its own
small `createModel` (reads `config.baseUrl` and an optional decrypted key,
rather than assuming a bare API key is always present) but otherwise
plugs into the same dialog/executor/registration shape as every other
provider. All four get logo SVGs under `public/`, `NodeType`/
`CredentialType` enum members, `executor-registry.ts` and
`node-components.ts` entries, and node-selector rows. The node-sizing and
logo-squircle fix (separate, already-shipped bounded change) applies to
these automatically — no extra work.

## Testing

- One unit test per model-fetcher (mocked HTTP response — success,
  non-2xx, and malformed-response cases).
- `listModels` tRPC procedure: ownership scoping (a credential belonging
  to a different user is never returned), and error surfacing.
- Executor fallback-to-default-model path (a node saved before this
  feature, with no `data.model`, still resolves a real model string).
- Executor parameter threading: temperature/maxOutputTokens/JSON mode
  reach the mocked `generateText` call with the values the node data
  specified (extending the existing `MockLanguageModelV3` pattern already
  proven out for the Agent executor's tests).
- Dialog: credential→model dependency (model list refetches/clears when
  the credential changes), matching the provider→credential reset pattern
  already implemented and regression-tested in the Agent dialog.
- Ollama credential creation: `config.baseUrl` required, `value` optional;
  round-trips correctly through `apiKeys.create` → `listModels`.
