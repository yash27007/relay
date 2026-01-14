"use client";
import { useQueryStates } from "nuqs";
import { workflowParams } from "../params";

export const useWorkflowParams = () => {
  return useQueryStates(workflowParams);
};
