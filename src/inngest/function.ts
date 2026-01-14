import { inngest } from "./client";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export const execute = inngest.createFunction(
  { id: "execute-ai" },
  { event: "execute/ai" },
  async ({ step }) => {
    await step.sleep("Gemini", "10s");
    const { steps: geminSteps } = await step.ai.wrap(
      "gemini-generate-text",
      generateText,
      {
        model: google("gemini-3-flash-preview"),
        system: "You are a helpful assistant",
        prompt: "What is 2 + 2",
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
        },
      },
    );
    // await step.sleep("Waiting for openai", "10s");
    // const { steps: openAiSteps } = await step.ai.wrap(
    //   "openai-generate-text",
    //   generateText,
    //   {
    //     model: openai("gpt-5"),
    //     system: "You are a helpful assistant",
    //     prompt: "What is 2 + 2",
    //     experimental_telemetry: {
    //       isEnabled: true,
    //       recordInputs: true,
    //       recordOutputs: true,
    //     },
    //   }
    // );

    // const { steps: anthropicSteps } = await step.ai.wrap(
    //   "anthropic-generate-text",
    //   generateText,
    //   {
    //     model: anthropic("claude-sonnet-4-0"),
    //     system: "You are a helpful assistant",
    //     prompt: "What is 2 + 2",
    //     experimental_telemetry: {
    //       isEnabled: true,
    //       recordInputs: true,
    //       recordOutputs: true,
    //     },
    //   }
    // );

    return {
      // openAiSteps  ,
      geminSteps,
      // anthropicSteps,
    };
  },
);
