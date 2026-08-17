/**
 * Tool connections (an Agent node calling another node as a tool) reuse the
 * same handle-ID convention that already drives branch routing (IF/Switch's
 * `${nodeId}-${branch}-source`) — no new DB column. A connection whose
 * `toInput` ends with "-tool-target" is a tool connection, not a flow
 * connection; runWorkflow excludes these from its topological sort and
 * reachability walk entirely (see run-workflow.ts).
 */

export function toolTargetHandleId(nodeId: string): string {
  return `${nodeId}-tool-target`;
}

export function toolSourceHandleId(nodeId: string): string {
  return `${nodeId}-tool-source`;
}

export function isToolConnection(connection: { toInput: string | null }): boolean {
  return connection.toInput?.endsWith("-tool-target") ?? false;
}
