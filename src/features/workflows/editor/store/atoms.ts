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

/**
 * Which node's execution output the NodeOutputDrawer is showing, if any.
 * Set by clicking a node's status badge (see BaseNode) — a shared atom
 * rather than a prop threaded through all 13 node components, since the
 * badge itself already lives in one shared place (BaseNode) but the
 * drawer that reacts to it is mounted once at the Editor level.
 */
export const selectedOutputNodeIdAtom = atom<string | null>(null);

/**
 * True while viewing a past run's canvas in read-only replay mode (see
 * Editor's `?run=` handling). WorkflowNode reads this to hide its
 * Settings/Delete toolbar — the one place every node type's edit
 * affordances already funnel through, so this is a single-file guard
 * rather than a readOnly prop threaded through every node component.
 */
export const editorReadOnlyAtom = atom<boolean>(false);
