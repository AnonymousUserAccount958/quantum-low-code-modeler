/**
 * Rules for the inputs of a QAOA block (problem graph, Gamma, Beta). They follow the
 * backend (leqo-backend/app/enricher/qaoa.py):
 * - the problem graph is a list of pairs of qubit indices, "[[0,1],[1,2]]" or flat
 *   "0,1,1,2"; for Max-2-SAT the clauses may also be DIMACS literals (1-based, a minus
 *   negates the literal), e.g. "[[1,-2],[2,3]]";
 * - Gamma and Beta hold one angle per layer (p values, comma separated).
 * An Array block connected to a QAOA input shows an example of a valid value as its
 * placeholder (its value is left alone).
 */

import type { Edge, Node } from "reactflow";
import { DataTypeNode, QAOANode } from "@/constants";
import { parseNumbers } from "./dataTypeRules";

export interface QAOAInputIssues {
  /** Why the circuit cannot be built (the "▸ Circuit" button stays disabled). */
  errors: string[];
  /** Allowed, but probably not what was meant. */
  warnings: string[];
}

const PARAM_INPUTS = [
  { index: 1, name: "Gamma (γ)", fallback: 0.5 },
  { index: 2, name: "Beta (β)", fallback: 0.2 },
] as const;

const handleOf = (nodeId: string, k: number) =>
  `classicalHandleQAOAInput${k}${nodeId}`;

const layersOf = (node: Node) => {
  const p = parseInt(String(node.data?.p ?? 1), 10);
  return Number.isFinite(p) && p >= 1 ? p : 1;
};

const graphNameOf = (node: Node) =>
  node.data?.problem === "Max2SAT" ? "clauses" : "edges";

/** The block connected to input k of the QAOA block. */
function sourceOf(
  node: Node,
  k: number,
  nodes: Node[],
  edges: Edge[],
): Node | null | undefined {
  const edge = edges.find(
    (e) => e.target === node.id && e.targetHandle === handleOf(node.id, k),
  );
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.source);
}

const isDataBlock = (n: Node | null | undefined): n is Node =>
  n?.type === DataTypeNode;

const isArrayBlock = (n: Node | null | undefined) =>
  isDataBlock(n) &&
  String(n.data?.dataType ?? n.data?.label ?? "").toLowerCase() === "array";

const hasPlaceholder = (text: string) => /[a-zA-Z_]/.test(text);

/** Pairs of the problem graph, or what is wrong with the value. */
export function parseQAOAPairs(value: unknown): number[][] | string {
  const text = String(value ?? "").trim();
  if (!text) return "empty";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith("[") ? text : `[${text}]`);
  } catch {
    return "format";
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "empty";
  let pairs: unknown[];
  if (parsed.every((x) => !Array.isArray(x))) {
    // a flat list: read two by two, as the backend does
    if (parsed.length % 2 !== 0) return "odd";
    pairs = [];
    for (let i = 0; i < parsed.length; i += 2)
      pairs.push([parsed[i], parsed[i + 1]]);
  } else if (parsed.every((x) => Array.isArray(x))) {
    pairs = parsed;
  } else {
    return "format";
  }
  for (const pair of pairs as unknown[][]) {
    if (pair.length !== 2) return "pair";
    if (!pair.every((x) => typeof x === "number" && Number.isInteger(x)))
      return "integer";
  }
  return pairs as number[][];
}

/** Errors and warnings of the problem graph input. */
function graphIssues(
  node: Node,
  nodes: Node[],
  edges: Edge[],
  out: QAOAInputIssues,
) {
  const source = sourceOf(node, 0, nodes, edges);
  const name = graphNameOf(node);
  const Name = name[0].toUpperCase() + name.slice(1);
  if (source === null) {
    out.warnings.push(
      `Connect an Array block with the ${name} of the problem graph.`,
    );
    return;
  }
  if (!isArrayBlock(source)) {
    out.errors.push(
      `The ${name} must come from an Array block with fixed values, e.g. [[0,1],[1,2]].`,
    );
    return;
  }
  const text = String(source.data?.value ?? "").trim();
  const example = qaoaExample(node, 0) ?? "";
  if (!text) {
    out.errors.push(
      `Enter the ${name} in the connected Array block, e.g. ${example}.`,
    );
    return;
  }
  if (hasPlaceholder(text)) {
    out.errors.push(
      `The ${name} contain a placeholder ("${text}"): enter numbers to build the circuit, e.g. ${example}.`,
    );
    return;
  }
  const pairs = parseQAOAPairs(text);
  if (typeof pairs === "string") {
    const why: Record<string, string> = {
      empty: `${Name} are empty`,
      odd: `${Name} need an even number of values (two qubits per ${name.slice(0, -1)})`,
      pair: `Every ${name.slice(0, -1)} needs exactly two qubits`,
      integer: `${Name} must be whole numbers (qubit indices)`,
      format: `${Name} must be pairs of numbers`,
    };
    out.errors.push(`${why[pairs]}, e.g. ${example}.`);
    return;
  }

  const flat = pairs.flat();
  const max2sat = node.data?.problem === "Max2SAT";
  const negative = flat.some((x) => x < 0);
  // DIMACS literals (1-based, negated with a minus): the backend reads them like this
  const dimacs = negative || (max2sat && !flat.includes(0));
  if (negative && !max2sat) {
    out.errors.push(
      `${Name} must be qubit indices from 0 on; negative values are only allowed for Max-2-SAT clauses.`,
    );
    return;
  }
  if (dimacs && flat.includes(0)) {
    out.errors.push(
      "Max-2-SAT clauses with negated literals use DIMACS numbering (1, 2, … and -1, -2, …), so 0 is not allowed. Use 0-based indices without minus or 1-based literals.",
    );
    return;
  }
  const qubitOf = (x: number) => (dimacs ? Math.abs(x) - 1 : x);
  const self = pairs.find(([u, v]) => qubitOf(u) === qubitOf(v));
  if (self) {
    out.errors.push(
      `[${self.join(",")}] uses the same qubit twice: every ${name.slice(0, -1)} needs two different qubits.`,
    );
    return;
  }

  const numQubits = Math.max(...flat.map((x) => qubitOf(x))) + 1;
  const used = new Set(flat.map(qubitOf));
  const unused = Array.from({ length: numQubits }, (_, q) => q).filter(
    (q) => !used.has(q),
  );
  if (unused.length > 0)
    out.warnings.push(
      `Qubit${unused.length > 1 ? "s" : ""} ${unused.join(", ")} ${unused.length > 1 ? "are" : "is"} in no ${name.slice(0, -1)} (the register has ${numQubits} qubits): ${unused.length > 1 ? "they only get" : "it only gets"} the Hadamard and the mixer.`,
    );
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const [u, v] of pairs) {
    // MaxCut and Graph Coloring edges are undirected; Max-2-SAT clauses are symmetric too
    const key = [u, v].sort((a, b) => a - b).join(",");
    if (seen.has(key)) duplicates.add(`[${u},${v}]`);
    seen.add(key);
  }
  if (duplicates.size > 0)
    out.warnings.push(
      `${[...duplicates].join(", ")} ${duplicates.size > 1 ? "appear" : "appears"} more than once: the cost term is applied once per occurrence.`,
    );
}

/** Errors and warnings of the Gamma and Beta inputs. */
function paramIssues(
  node: Node,
  nodes: Node[],
  edges: Edge[],
  out: QAOAInputIssues,
) {
  const p = layersOf(node);
  for (const { index, name } of PARAM_INPUTS) {
    const source = sourceOf(node, index, nodes, edges);
    const example = qaoaExample(node, index) ?? "";
    if (source === null) {
      out.warnings.push(
        `Connect an Array block with ${name}: one angle per layer (p = ${p}), e.g. ${example}.`,
      );
      continue;
    }
    if (!isDataBlock(source)) {
      out.errors.push(
        `${name} must come from an Array or Number block with fixed values, e.g. ${example}.`,
      );
      continue;
    }
    const text = String(source.data?.value ?? "").trim();
    if (!text) {
      out.errors.push(`Enter ${name} in the connected block, e.g. ${example}.`);
      continue;
    }
    if (hasPlaceholder(text)) {
      out.errors.push(
        `${name} contains a placeholder ("${text}"): enter ${p} number${p > 1 ? "s" : ""} to build the circuit, e.g. ${example}.`,
      );
      continue;
    }
    const values = parseNumbers(text);
    if (!values) {
      out.errors.push(
        `${name} must be numbers separated by commas, e.g. ${example}.`,
      );
      continue;
    }
    if (values.length !== p) {
      out.errors.push(
        `${name} has ${values.length} value${values.length === 1 ? "" : "s"}, but there ${p === 1 ? "is" : "are"} ${p} layer${p === 1 ? "" : "s"} (p): enter one angle per layer, e.g. ${example}.`,
      );
      continue;
    }
    const outside = values.filter((x) => Math.abs(x) > 2 * Math.PI);
    if (outside.length > 0)
      out.warnings.push(
        `${name} ${outside.join(", ")} ${outside.length > 1 ? "are" : "is"} larger than 2π: angles repeat every 2π, so a smaller angle has the same effect.`,
      );
  }
}

/** Errors and warnings of the inputs of a QAOA block. */
export function qaoaInputIssues(
  node: Node,
  nodes: Node[],
  edges: Edge[],
): QAOAInputIssues {
  const out: QAOAInputIssues = { errors: [], warnings: [] };
  graphIssues(node, nodes, edges, out);
  paramIssues(node, nodes, edges, out);
  return out;
}

/** A valid example for input k (0 graph, 1 Gamma, 2 Beta) of a QAOA block. */
export function qaoaExample(qaoa: Node, k: number): string | null {
  if (k === 0)
    return qaoa.data?.problem === "Max2SAT"
      ? "[[1,-2],[2,3]]"
      : "[[0,1],[1,2]]";
  const param = PARAM_INPUTS.find((x) => x.index === k);
  if (!param) return null;
  return Array(layersOf(qaoa)).fill(param.fallback).join(",");
}

/**
 * The placeholder of a data block connected to a QAOA block: a valid example for the
 * input it is connected to (a graph for the edges, p angles for Gamma and Beta), or null.
 */
export function qaoaPlaceholder(
  source: Node | undefined,
  nodes: Node[],
  edges: Edge[],
): string | null {
  if (!isDataBlock(source)) return null;
  for (const edge of edges) {
    if (edge.source !== source.id) continue;
    const target = nodes.find((n) => n.id === edge.target);
    if (target?.type !== QAOANode) continue;
    const match = String(edge.targetHandle ?? "").match(
      /^classicalHandleQAOAInput(\d)/,
    );
    if (!match) continue;
    const k = parseInt(match[1], 10);
    // the graph is always an array; Gamma and Beta may also be a single Number for p = 1
    if (k === 0 && !isArrayBlock(source)) continue;
    const example = qaoaExample(target, k);
    if (example) return example;
  }
  return null;
}
