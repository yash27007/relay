import type { ReactFlowInstance } from "@xyflow/react";
import { atom } from "jotai";

export const editorAtom = atom<ReactFlowInstance | null>(null);

// Autosave state
export const autosaveEnabledAtom = atom<boolean>(true);
export const autosaveStatusAtom = atom<{
  isSaving: boolean;
  lastSaved: Date | null;
}>({
  isSaving: false,
  lastSaved: null,
});
