/**
 * Rules for classical data type blocks (Number, Array, File, String) connected to other
 * blocks:
 * - File only goes into QML blocks (based on QHAna) that expect a file, String into
 *   those that expect a file or a string; every other "any" input therefore accepts
 *   any type except these two.
 * - An encoding (Prepare State / Encode Value) only has a circuit for a value it can
 *   encode; the rules follow the backend (leqo-backend/app/enricher/encode_value*,
 *   schmidt_decomposition.py). A data block connected to an encoding shows an example
 *   the encoding can encode as its placeholder (its value is left alone).
 */

import type { Edge, Node } from "reactflow";

/** How an untyped input ("any") is labelled. */
export const ANY_TYPE_LABEL = "any (without File, String)";

/** Label of an input type for display: "any" names the excluded types. */
export function displayInputType(type: string | undefined | null): string {
  const t = (type ?? "any").trim();
  return t.toLowerCase() === "any" ? ANY_TYPE_LABEL : t;
}

/** The data type of a data type block in lower case, e.g. "file", "string", "array". */
function dataTypeOf(node: Node | undefined): string | null {
  if (node?.type !== "dataTypeNode") return null;
  return String(node.data?.dataType ?? node.data?.label ?? "").toLowerCase();
}

/** Internal type of an input of a QML block, from the QHAna data type. */
function pluginInputType(target: Node, targetHandle: string): string | null {
  const match = targetHandle.match(/^classicalHandlePluginInput(\d+)/);
  if (!match) return null;
  const input = (target.data?.dataInputs ?? [])[parseInt(match[1], 10)];
  const t = String(input?.data_type ?? "").toLowerCase();
  if (t.startsWith("entity/") || t === "file" || t === "model") return "file";
  return t || null;
}

/**
 * Null if the source may be connected to the target input, otherwise why not: File and
 * String data blocks only go into QML block inputs that expect a file.
 */
export function fileOrStringConnectionError(
  source: Node | undefined,
  target: Node | undefined,
  targetHandle: string | null | undefined,
): string | null {
  const type = dataTypeOf(source);
  if (type !== "file" && type !== "string") return null;
  const name = type === "file" ? "File" : "String";
  const expected =
    target?.type === "pluginNode" && targetHandle
      ? pluginInputType(target, targetHandle)
      : null;
  // a file goes into file inputs; a string into file inputs (as a path or URL) and into
  // string inputs
  if (expected === "file" || (type === "string" && expected === "string")) {
    return null;
  }
  return type === "file"
    ? "Cannot connect: File can only be connected to QML blocks that expect a file."
    : `Cannot connect: ${name} can only be connected to QML blocks that expect a file or a string.`;
}

// ---------------------------------------------------------------------------
// Encodings
// ---------------------------------------------------------------------------

export type EncodingKind =
  | "basis"
  | "angle"
  | "amplitude"
  | "matrix"
  | "schmidt"
  | "custom";

/** The encoding of a Prepare State / Encode Value block, or null for other blocks. */
export function encodingKind(node: Node | undefined): EncodingKind | null {
  if (node?.type !== "statePreparationNode") return null;
  const label = String(node.data?.label ?? "");
  const name = (
    label === "Encode Value" ? String(node.data?.encodingType ?? "") : label
  ).toLowerCase();
  if (name.startsWith("basis")) return "basis";
  if (name.startsWith("angle")) return "angle";
  if (name.startsWith("amplitude")) return "amplitude";
  if (name.startsWith("matrix")) return "matrix";
  if (name.startsWith("schmidt")) return "schmidt";
  if (name.startsWith("custom")) return "custom";
  return null;
}

/** An example value each encoding can encode, the placeholder of a connected data block. */
export const ENCODING_EXAMPLES: Record<EncodingKind, string | null> = {
  basis: "5",
  // a normalized array (length 1), one rotation angle per value
  angle: "0.6,0.8",
  // a normalized vector of 2^n values: here the uniform superposition of 2 qubits
  amplitude: "0.5,0.5,0.5,0.5",
  // a unitary 2^n x 2^n matrix, row by row: here the X gate
  matrix: "0,1,1,0",
  // a state of two qubits (at least two subsystems): here the Bell state
  schmidt: "0.7071,0,0,0.7071",
  custom: null,
};

/** Numbers of an array value: "1,2", "[1,2]" or "[[1,0],[0,1]]" (read row by row). */
export function parseNumbers(value: unknown): number[] | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let items: unknown[];
  try {
    const parsed = JSON.parse(text.startsWith("[") ? text : `[${text}]`);
    items = Array.isArray(parsed) ? parsed.flat(Infinity) : [parsed];
  } catch {
    items = text.replace(/[[\]]/g, "").split(/[,;]/);
  }
  const numbers = items.map((x) => Number(String(x).trim()));
  return numbers.length > 0 && numbers.every((x) => Number.isFinite(x))
    ? numbers
    : null;
}

const isPowerOfTwo = (n: number) => n >= 1 && (n & (n - 1)) === 0;

/**
 * Null if the encoding can encode the value, otherwise what is wrong with it (shown on
 * the disabled "▸ Circuit" button).
 */
export function encodingValueError(
  kind: EncodingKind,
  value: unknown,
): string | null {
  const text = String(value ?? "").trim();
  if (!text) return "Enter a value in the connected data block first.";
  if (kind === "custom") return null;
  if (kind === "basis") {
    if (!/^\d+$/.test(text) || parseInt(text, 10) < 1)
      return "Basis encoding needs a whole number of at least 1, e.g. 5.";
    return null;
  }
  const numbers = parseNumbers(text);
  if (!numbers)
    return "The value must be numbers separated by commas, e.g. 0.5,0.5,0.5,0.5.";
  if (kind === "angle") return null;
  const zero = numbers.every((x) => x === 0);
  if (kind === "amplitude") {
    if (numbers.length < 2 || !isPowerOfTwo(numbers.length))
      return `Amplitude encoding needs 2, 4, 8, … values (a power of two), not ${numbers.length}.`;
    if (zero) return "Amplitude encoding needs a vector that is not all zeros.";
    return null;
  }
  if (kind === "schmidt") {
    if (numbers.length < 4 || !isPowerOfTwo(numbers.length))
      return `The Schmidt decomposition needs a state of at least 2 qubits: 4, 8, 16, … values, not ${numbers.length}.`;
    if (zero) return "The state vector must not be all zeros.";
    return null;
  }
  // matrix: a unitary 2^n x 2^n matrix, row by row
  const dim = Math.round(Math.sqrt(numbers.length));
  if (dim * dim !== numbers.length || dim < 2 || !isPowerOfTwo(dim))
    return `Matrix encoding needs a 2^n × 2^n matrix (4, 16, … values row by row), not ${numbers.length} values.`;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      let dot = 0;
      for (let k = 0; k < dim; k++)
        dot += numbers[i * dim + k] * numbers[j * dim + k];
      if (Math.abs(dot - (i === j ? 1 : 0)) > 1e-3)
        return "Matrix encoding needs a unitary matrix (its rows must be orthonormal), e.g. 0,1,1,0.";
    }
  }
  return null;
}

/**
 * The placeholder of a data block: an example the encoding it is connected to can
 * encode (e.g. a unitary matrix for Matrix Encoding, a normalized array for Angle
 * Encoding), or null to keep its usual placeholder.
 */
export function encodingPlaceholder(
  source: Node | undefined,
  nodes: Node[],
  edges: Edge[],
): string | null {
  if (source?.type !== "dataTypeNode") return null;
  const type = dataTypeOf(source);
  for (const edge of edges) {
    if (edge.source !== source.id) continue;
    const kind = encodingKind(nodes.find((n) => n.id === edge.target));
    if (!kind) continue;
    // only for the type the encoding reads (a Number for basis, else an Array)
    const fits =
      kind === "basis"
        ? type === "float" || type === "number" || type === "int"
        : type === "array";
    const example = ENCODING_EXAMPLES[kind];
    if (fits && example) return example;
  }
  return null;
}
