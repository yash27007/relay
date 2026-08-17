import { NonRetriableError } from "inngest";
import ky, { type Options as KyOps } from "ky";
import { NodeExecutor } from "../../../executions/types";
import type { AiToolConfig } from "../../lib/ai-tool";
import { resolveTemplate } from "../../lib/resolve-template";

export type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
  body?: string;
  /** Set when this node is configured as a callable Agent tool (Task 7 reads this). */
  aiTool?: AiToolConfig;
};

function stringifyResolved(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

export const HttpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
  nodeId,
  context,
  data,
  step,
}) => {
  if (!data.endpoint) {
    throw new NonRetriableError("HTTP Request node: No endpoint configured");
  }
  if (!data.variableName) {
    throw new NonRetriableError("HTTP Request Node: Variable name is required");
  }

  const resolvedEndpoint = stringifyResolved(resolveTemplate(data.endpoint, context));

  let endpointURL: URL;
  try {
    endpointURL = new URL(resolvedEndpoint);
  } catch {
    throw new NonRetriableError("HTTP Request Node: Invalid URL endpoint");
  }
  if (!["http:", "https:"].includes(endpointURL.protocol)) {
    throw new NonRetriableError("HTTP Request Node: Unsupported Protocol");
  }

  const resolvedBody =
    data.body !== undefined
      ? stringifyResolved(resolveTemplate(data.body, context))
      : undefined;

  const response = await step.run(`http-request-${nodeId}`, async () => {
    const method = data.method || "GET";
    const endpoint = endpointURL.toString();
    const options: KyOps = { method };
    if (["POST", "PUT", "PATCH"].includes(method)) {
      options.body = resolvedBody;
      options.headers = {
        "Content-Type": "application/json",
      };
    }

    const response = await ky(endpoint, options);
    const contentType = response.headers.get("content-type");
    const responseData = contentType?.includes("application/json")
      ? await response.json()
      : await response.text();

    const responsePayload = {
      httpResponse: {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
      },
    };

    if (data.variableName) {
      return {
        ...context,
        [data.variableName]: responsePayload,
      };
    }
    // Fallback to direct HTTP response for backword compatibility
    return {
      ...context,
      ...responsePayload,
    };
  });

  return { context: response };
};
