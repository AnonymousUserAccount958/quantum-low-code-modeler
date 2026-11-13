/**
 * Whether a block can be opened to its circuit level ("▸ Circuit", "Show circuit level")
 * yet: its gates are only fixed once the settings and inputs that determine them are
 * there. Returns why not (shown on the disabled button and when it is clicked), or null.
 */

import type { Edge, Node } from "reactflow";
import {
  GroverDiffuserNode,
  OperatorNode,
  QAOANode,
  StatePreparationNode,
  UniversalOracleNode,
} from "@/constants";
import { encodingKind, encodingValueError } from "./dataTypeRules";
import { qaoaInputIssues } from "./qaoaRules";

const connected = (edges: Edge[], nodeId: string, handle: string) =>
  edges.some((e) => e.target === nodeId && e.targetHandle === handle);

export function circuitBlockedReason(
  node: Node,
  nodes: Node[],
  edges: Edge[],
): string | null {
  const id = node.id;
  const data = node.data ?? {};

  if (node.type === UniversalOracleNode) {
    const marked = String(data.targetStates ?? "").trim();
    if (!marked)
      return "Enter the marked states first: they decide the gates of the oracle.";
    if (!/^\d+(\s*,\s*\d+)*$/.test(marked))
      return "The marked states must be numbers (no placeholders) to build the oracle's gates.";
    if (!connected(edges, id, `quantumHandleInput0${id}`))
      return "Connect the register first: its size decides how many qubits the oracle acts on.";
    return null;
  }

  if (node.type === GroverDiffuserNode) {
    if (!connected(edges, id, `quantumHandleInput0${id}`))
      return "Connect the register first: the diffusion operator acts on all of its qubits, so its gates depend on the register size.";
    return null;
  }

  if (node.type === QAOANode) {
    const names = ["the problem graph", "Gamma (γ)", "Beta (β)"];
    const missing = names.filter(
      (_, k) => !connected(edges, id, `classicalHandleQAOAInput${k}${id}`),
    );
    if (missing.length > 0)
      return `Connect ${missing.join(", ")} first: QAOA needs all three inputs to build its gates.`;
    // the values decide the qubits and angles of the gates, see qaoaRules.ts
    return qaoaInputIssues(node, nodes, edges).errors[0] ?? null;
  }

  if (node.type === OperatorNode) {
    const label = String(data.label ?? "");
    const unary =
      label.includes("Min & Max") ||
      data.operator === "~" ||
      data.operator === "INVERT";
    const inputs = unary ? [0] : [0, 1];
    const missing = inputs.filter(
      (k) => !connected(edges, id, `quantumHandleOperationInput${k}${id}`),
    );
    if (missing.length > 0)
      return `Connect ${missing.length === inputs.length && inputs.length > 1 ? "both inputs" : `input ${missing[0] + 1}`} first: the gates of the operator depend on the registers it works on.`;
    return null;
  }

  if (node.type === StatePreparationNode && data.label === "Prepare State") {
    // the size decides the number of qubits and so the gates (same rules as the
    // size check of the block)
    const name = String(data.quantumStateName ?? "Bell State φ+");
    const text = String(data.size ?? "").trim();
    if (!text)
      return "Enter the size of the state first: it decides how many qubits are prepared.";
    if (!/^[1-9]\d*$/.test(text))
      return `The size must be a whole number of at least 1, not "${text}".`;
    const size = parseInt(text, 10);
    if (name.startsWith("Bell") && size !== 2)
      return `A Bell state has 2 qubits, not ${size}: set the size to 2.`;
    if ((name === "GHZ" || name === "W-State") && size < 3)
      return `${name} needs a size of at least 3, not ${size}.`;
    return null;
  }

  if (node.type === StatePreparationNode && data.label !== "Prepare State") {
    const valueEdge = edges.find(
      (e) =>
        e.target === id &&
        e.targetHandle === `classicalHandleStatePreparationInput0${id}`,
    );
    if (!valueEdge)
      return "Connect the value to encode first: the circuit of an encoding depends on it.";
    const source = nodes.find((n) => n.id === valueEdge.source);
    if (source?.type === "dataTypeNode") {
      if (String(source.data?.value ?? "").trim() === "")
        return `Enter a value in the connected ${source.data?.label ?? "data"} block first: the circuit of an encoding depends on it.`;
      const kind = encodingKind(node);
      if (kind) return encodingValueError(kind, source.data?.value);
    }
    return null;
  }

  return null;
}
