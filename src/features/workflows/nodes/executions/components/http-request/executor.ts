import { NonRetriableError } from "inngest";
import { NodeExecutor } from "../../../executions/types";
import ky, { type Options as KyOps } from "ky"


type HttpRequestData = {
  endpoint?: string;
  method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
  body?: string;
};

export const HttpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
  nodeId,
  context,
  data,
  step,
}) => {
  // TODO PUBLISH loading state for manual trigger
  if (!data.endpoint) {
    throw new NonRetriableError("HTTP Request node: No endpoint configured");
  }

  const response = await step.run("http-request",async ()=>{
    const method = data.method || "GET"
    const endpoint = data.endpoint!

    const options: KyOps = { method}
    if(["POST","PUT","PATCH"].includes(method)){
        options.body = data.body
    }

    const response = await ky(endpoint,options)
    const contentType = response.headers.get("content-type")
    const responseData = contentType?.includes("application/json")
    ? await response.json()
    : await response.text()

    return{
      ...context,
      httpResponse: {
        status: response.status,
        statusText:response.statusText,
        data: responseData

      }
    }
  })

  // TODO Publish success State for maual trigger
  return response;
};
