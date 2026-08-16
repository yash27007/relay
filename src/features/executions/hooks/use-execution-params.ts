"use client";
import { useQueryStates } from "nuqs";
import { executionParams } from "../params";

export const useExecutionParams = () => {
  return useQueryStates(executionParams);
};
