/**
 * Converts an OpenQASM file into a model (File → Open OpenQASM, and the circuits of
 * generated models). The gates and groups come from the same parser as "Apply to
 * Canvas" in the OpenQASM editor (qasmToNodes): all gates it knows, groups given by
 * "/* Start group <label> *\/" … "/* End group <label> *\/" and recognized states (e.g. a
 * Bell state). Measurements are added here as a Merger and a Measurement block.
 */

import type { Edge, Node } from "reactflow";
import { qasmToNodes } from "./lib/qasmToNodes";

type FlowJson = {
  metadata: any;
  nodes: any[];
  edges: any[];
  viewport: { x: number; y: number; zoom: number };
};

const generateId = () => crypto.randomUUID();

/** Width of a node on the canvas (a group has its size in style). */
const NODE_WIDTH = 110;

function makeEdge(
  source: string,
  target: string,
  sHandle: string,
  tHandle: string,
): Edge {
  return {
    id: generateId(),
    source,
    target,
    sourceHandle: sHandle,
    targetHandle: tHandle,
    type: "quantumEdge",
    markerEnd: {
      type: "arrowclosed",
      width: 20,
      height: 20,
      color: "#93C5FD",
    } as Edge["markerEnd"],
  };
}

function createMergerNode(
  id: string,
  x: number,
  y: number,
  identifiers: string[],
  inputs: any[],
) {
  return {
    id,
    type: "mergerNode",
    position: { x, y },
    data: {
      label: "Merger",
      inputs,
      children: [],
      identifiers,
      inputTypes: Array(inputs.length).fill("quantum register"),
      outputTypes: ["quantum register"],
      numberInputs: inputs.length,
      completionGuaranteed: true,
      compactOptions: [true, false],
    },
    width: 170,
    height: 165,
  };
}

export function openQasmToFlow(qasm: string): FlowJson {
  qasm = qasm.replace(/\r\n/g, "\n").replace(/\uFEFF/g, "");

  // Registers: QASM 3 "qubit[N] name;" or QASM 2 "qreg name[N];", numbered one after
  // the other (as in qasmToNodes)
  const registerStart = new Map<string, number>();
  const registerSize = new Map<string, number>();
  let n = 0;
  const registerRe =
    /qubit(?:\[(\d+)\])?\s+([a-zA-Z0-9_]+)\s*;|qreg\s+([a-zA-Z0-9_]+)\s*\[(\d+)\]\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = registerRe.exec(qasm))) {
    const name = m[2] ?? m[3];
    const size = Number(m[1] ?? m[4] ?? 1);
    registerStart.set(name, n);
    registerSize.set(name, size);
    n += size;
  }
  if (n === 0)
    throw new Error(
      'No qubit register found. Expected "qubit[N] name;" (OpenQASM 3) or "qreg name[N];" (OpenQASM 2).',
    );

  // gates and groups
  const parsed = qasmToNodes(qasm);
  const nodes: any[] = parsed.nodes;
  const edges: any[] = parsed.edges;
  const qLabel = (q: number) => `q${q}`;

  // Aliases of LEQO code:
  //    let alias = reg[{0}]
  //    let alias = reg[{2,3}]
  //    let alias = otherAlias;
  const aliasMap: Record<string, number[]> = {};
  const directAliasRe =
    /let\s+([a-zA-Z0-9_.]+)\s*=\s*([a-zA-Z0-9_.]+)\s*\[\{([^}]+)\}\]\s*;/g;
  while ((m = directAliasRe.exec(qasm))) {
    const [, alias, source, list] = m;
    const idxs = list.split(",").map((s) => Number(s.trim()));
    const start = registerStart.get(source);
    if (start !== undefined) aliasMap[alias] = idxs.map((i) => start + i);
    else if (aliasMap[source])
      aliasMap[alias] = idxs.map((i) => aliasMap[source][i]);
  }
  const indirectAliasRe = /let\s+([a-zA-Z0-9_.]+)\s*=\s*([a-zA-Z0-9_.]+)\s*;/g;
  while ((m = indirectAliasRe.exec(qasm))) {
    const [, dst, src] = m;
    if (!aliasMap[dst] && aliasMap[src]) aliasMap[dst] = [...aliasMap[src]];
  }

  /** Global index of qubit `localIdx` of a register or alias. */
  function resolveQubit(name: string, localIdx: number): number | undefined {
    if (aliasMap[name] !== undefined) return aliasMap[name][localIdx];
    const start = registerStart.get(name);
    return start !== undefined ? start + localIdx : undefined;
  }

  // MEASUREMENTS
  //    QASM 3: bit[N] name = measure alias[{0,1}];   bit[N] c = measure q;
  //            c = measure q;   c[0] = measure q[0];
  //    QASM 2: measure q[i] -> c[j];   or   measure q -> c;
  // All measured qubits go into one Merger (skipped for a single qubit) and one
  // Measurement block, whose indices are the measured qubits (empty for all).
  const noComments = qasm
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const measured: number[] = [];
  let outputName: string | null = null;
  const addMeasured = (q: number | undefined) => {
    if (q !== undefined && q < n && !measured.includes(q)) measured.push(q);
  };

  // [optional "bit[N]"] target[optional index] = measure source[optional {i,j} or i]
  const measRe =
    /(?:\bbit(?:\[\d+\])?\s+)?\b([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\[\d+\])?\s*=\s*measure\s+([a-zA-Z0-9_.]+)\s*(?:\[\s*\{?([\d\s,]+)\}?\s*\])?\s*;/g;
  while ((m = measRe.exec(noComments))) {
    const [, target, source, list] = m;
    outputName ??= target;
    const all =
      aliasMap[source] ??
      [...Array(registerSize.get(source) ?? 0).keys()].map(
        (i) => (registerStart.get(source) ?? 0) + i,
      );
    const picked = list
      ? list.split(",").map((s) => all[Number(s.trim())])
      : all;
    picked.forEach(addMeasured);
  }

  const qasm2MeasRe =
    /measure\s+([a-zA-Z0-9_]+)\s*(?:\[(\d+)\])?\s*->\s*([a-zA-Z0-9_]+)\s*(?:\[\d+\])?\s*;/g;
  while ((m = qasm2MeasRe.exec(noComments))) {
    const start = registerStart.get(m[1]);
    if (start === undefined) continue;
    outputName ??= m[3];
    if (m[2] !== undefined) addMeasured(start + Number(m[2]));
    else for (let q = 0; q < n; q++) addMeasured(q);
  }

  if (measured.length > 0) {
    const allQubits = [...Array(n).keys()];
    const identifiers = allQubits.map(qLabel);
    // right of the circuit: top-level nodes and groups (children are relative to them)
    const right = Math.max(
      ...nodes
        .filter((nd: Node) => !nd.parentNode)
        .map(
          (nd: Node) => nd.position.x + (Number(nd.style?.width) || NODE_WIDTH),
        ),
    );
    const ys = nodes
      .filter((nd: Node) => parsed.qubitNodeIds.includes(nd.id))
      .map((nd: Node) => nd.position.y);
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;

    const measId = generateId();
    const measX = right + (n > 1 ? 400 : 150);
    const measTHandle = `quantumHandleMeasurementInput0${measId}`;

    let measInputNode: string;
    let measSHandle: string;

    if (n > 1) {
      const mergerId = generateId();
      const mergerInputs = allQubits.map((q) => {
        const last = parsed.lastHandles[q];
        const tHandle = `quantumHandleMergerInput${q}${mergerId}`;
        const e = makeEdge(last.nodeId, mergerId, last.handle, tHandle);
        edges.push(e);
        return {
          id: last.nodeId,
          edgeId: e.id,
          identifiers: [qLabel(q)],
          targetHandle: tHandle,
        };
      });
      nodes.push(
        createMergerNode(
          mergerId,
          measX - 350,
          midY + 160,
          identifiers,
          mergerInputs,
        ),
      );
      measInputNode = mergerId;
      measSHandle = `quantumHandleMergerOutput0${mergerId}`;
    } else {
      measInputNode = parsed.lastHandles[0].nodeId;
      measSHandle = parsed.lastHandles[0].handle;
    }

    const measEdge = makeEdge(measInputNode, measId, measSHandle, measTHandle);
    edges.push(measEdge);

    const measuredSorted = [...measured].sort((a, b) => a - b);

    nodes.push({
      id: measId,
      type: "measurementNode",
      position: { x: measX, y: midY },
      data: {
        label: "Measurement",
        inputs: [
          {
            id: measInputNode,
            edgeId: measEdge.id,
            identifiers,
            targetHandle: measTHandle,
          },
        ],
        children: [],
        identifiers,
        outputIdentifier: outputName,
        indices: measured.length === n ? "" : measuredSorted.join(","),
        inputTypes: ["quantum register"],
        outputTypes: ["array", "quantum register"],
        completionGuaranteed: true,
        compactOptions: [true, false],
      },
      width: 320,
      height: 440,
    });
  }

  return {
    metadata: {
      version: "1.0.0",
      name: "OpenQASM Import",
      description: "Converted model from OpenQASM",
      id: `flow-${Date.now()}`,
      author: "",
      timestamp: new Date().toISOString(),
      containsPlaceholder: false,
    },
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.8 },
  };
}
