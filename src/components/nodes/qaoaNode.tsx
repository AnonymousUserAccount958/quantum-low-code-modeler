import { memo, useEffect, useState } from "react";
import {
  Handle,
  Position,
  Node,
  useUpdateNodeInternals,
  Edge,
} from "reactflow";
import { useStore } from "@/config/store";
import { shallow } from "zustand/shallow";
import { cn } from "@/lib/utils";
import OutputPort from "../utils/outputPort";
import { CircuitLevelButton } from "../utils/circuitLevelButton";
import { circuitBlockedReason } from "@/lib/circuitReadiness";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { qaoaInputIssues } from "@/lib/qaoaRules";
import { parseNumbers } from "@/lib/dataTypeRules";
import { findDuplicateOutputIdentifiers } from "../utils/utils";
import { classicalConstructColor } from "@/constants";
import { awareness } from "@/yjs";

const selector = (state: any) => ({
  updateNodeValue: state.updateNodeValue,
  setSelectedNode: state.setSelectedNode,
  nodes: state.nodes,
  edges: state.edges,
});

export const QAOANode = memo((node: Node) => {
  const { id, data, selected } = node;
  const updateNodeInternals = useUpdateNodeInternals();
  const { updateNodeValue, setSelectedNode, nodes, edges } = useStore(
    selector,
    shallow,
  );

  const [p, setP] = useState(data.p || 1);
  const [problem, setProblem] = useState(data.problem || "MaxCut");
  const [optimizer, setOptimizer] = useState(data.optimizer || "COBYLA");

  const [outputs, setOutputs] = useState(data.outputs || []);
  const [outputIdentifierError, setOutputIdentifierError] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [startsWithDigitError, setStartsWithDigitError] = useState(false);

  useEffect(() => {
    const identifier = data.outputIdentifier || "";
    const duplicates = findDuplicateOutputIdentifiers(nodes, id);
    const isDuplicate = duplicates.has(identifier);
    const startsWithDigit = /^\d/.test(identifier);

    setOutputIdentifierError(isDuplicate && identifier !== "");
    setStartsWithDigitError(startsWithDigit);
  }, [nodes, id, data.outputIdentifier]);

  useEffect(() => {
    const getConnectedValue = (handleId: string) => {
      const edge = edges.find(
        (e: Edge) => e.target === id && e.targetHandle === handleId,
      );
      if (!edge) return null;
      const sourceNode = nodes.find((n: Node) => n.id === edge.source);
      return sourceNode ? sourceNode.data.value : null;
    };

    const rawGamma = getConnectedValue(`classicalHandleQAOAInput1${id}`);
    const rawBeta = getConnectedValue(`classicalHandleQAOAInput2${id}`);

    // the backend splits Gamma and Beta at commas, so "[0.5, 0.2]" is passed as "0.5,0.2"
    const toParam = (raw: any) => {
      if (raw == null) return "";
      const text = Array.isArray(raw) ? raw.join(",") : String(raw);
      return parseNumbers(text)?.join(",") ?? text;
    };
    const strGamma = toParam(rawGamma);
    const strBeta = toParam(rawBeta);

    if (data.gamma !== strGamma) {
      updateNodeValue(id, "gamma", strGamma);
    }
    if (data.beta !== strBeta) {
      updateNodeValue(id, "beta", strBeta);
    }
    // nodes: the values change in the connected Array blocks, not in the edges
  }, [nodes, edges, id, data.gamma, data.beta, updateNodeValue]);

  // errors keep "▸ Circuit" disabled; warnings only point out likely mistakes
  const inputIssues = qaoaInputIssues(node, nodes, edges);
  const identifierErrors = [
    ...(startsWithDigitError ? ["Identifier starts with a number."] : []),
    ...(outputIdentifierError ? ["Identifier is not unique."] : []),
  ];
  const errors = [...identifierErrors, ...inputIssues.errors];
  const warnings = inputIssues.warnings;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, p, updateNodeInternals]);

  const handleChange = (field: string, value: any) => {
    data[field] = value;
    updateNodeValue(id, field, value);
    setSelectedNode(node);
  };

  const dynamicHeight = 550;
  const classicalInputLabel = problem === "Max2SAT" ? "Clauses" : "Edges";

  const [remoteHighlightColor, setRemoteHighlightColor] = useState<
    string | null
  >(null);

  useEffect(() => {
    const checkRemoteSelection = () => {
      let foundColor: string | null = null;
      // Loop through all active client states in the room
      awareness.getStates().forEach((state: any) => {
        // Check if a peer has selected this specific node ID
        if (state.cursor && state.cursor.mySelectedNodeId === id) {
          foundColor = state.cursor.color;
        }
      });

      setRemoteHighlightColor(foundColor);
    };

    // Run once immediately on mount
    checkRemoteSelection();

    // 3. Listen to remote awareness updates
    awareness.on("change", checkRemoteSelection);

    // Clean up listener when the node unmounts
    return () => {
      awareness.off("change", checkRemoteSelection);
    };
  }, [id]); // Re-run if node ID changes

  return (
    <div className="grand-parent" style={{ width: 320, height: dynamicHeight }}>
      <div className="grand-parent">
        <div
          className={cn(
            "w-[320px] bg-white border border-solid border-gray-700 shadow-md relative flex flex-col",
            selected && "border-blue-500",
          )}
          style={{
            borderColor: remoteHighlightColor
              ? remoteHighlightColor
              : selected
                ? "#3B82F6"
                : "#374151",
            boxShadow: remoteHighlightColor
              ? `0 0 0 3px ${remoteHighlightColor}40, 0 0 12px ${remoteHighlightColor}` // Glowing aura ring
              : undefined,
            height: `${dynamicHeight}px`,
          }}
        >
          {/* Error Alerts Multi-Panel */}
          {(errors.length > 0 || warnings.length > 0) && (
            <div className="absolute top-2 right-[-40px] group z-20">
              {errors.length > 0 ? (
                <AlertCircle className="text-red-600 w-5 h-5" />
              ) : (
                <AlertTriangle className="text-amber-500 w-5 h-5" />
              )}
              {/* errors stay visible; warnings only (e.g. inputs not connected yet) on hover */}
              <div
                className={cn(
                  "absolute top-5 left-[30px] z-10 bg-white text-xs border border-gray-300 px-3 py-2 rounded shadow w-[260px] flex-col gap-1",
                  errors.length > 0 ? "flex" : "hidden group-hover:flex",
                )}
              >
                {errors.map((msg) => (
                  <div key={`e-${msg}`} className="text-red-600">
                    • {msg}
                  </div>
                ))}
                {warnings.map((msg) => (
                  <div key={`w-${msg}`} className="text-amber-600">
                    ⚠ {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HEADER */}
          <div className="w-full flex items-center" style={{ height: "52px" }}>
            <div
              className="w-full bg-blue-300 py-1 px-2 flex items-center"
              style={{ height: "inherit" }}
            >
              <img
                src="patterns/qaoa_icon.png"
                alt="QAOA icon"
                className="w-[40px] h-[40px] object-contain flex-shrink-0"
              />
              <div className="h-full w-[1px] bg-black mx-2" />
              <span
                className="font-semibold leading-none text-black"
                style={{ paddingLeft: "80px" }}
              >
                QAOA
              </span>
              <CircuitLevelButton
                nodeId={id}
                label="QAOA"
                disabledReason={
                  circuitBlockedReason(node, nodes, edges) ?? undefined
                }
              />
            </div>
          </div>

          {/* CONFIGURATION BODY */}
          <div className="px-4 py-2 mt-1 flex flex-col gap-3">
            {/* Problem Dropdown */}
            <div className="mt-1 flex flex-col items-center justify-center w-full">
              <label className="text-xs font-semibold text-gray-700 text-center mb-1">
                Problem:
              </label>
              <select
                className="w-full p-1 text-sm text-center text-black border-2 border-blue-200 rounded-full outline-none focus:border-blue-400 transition-colors"
                value={problem}
                onChange={(e) => {
                  setProblem(e.target.value);
                  handleChange("problem", e.target.value);
                }}
              >
                <option value="MaxCut">MaxCut</option>
                <option value="Max2SAT">Max-2-SAT</option>
                <option value="GraphColoring">Graph Coloring</option>
              </select>
            </div>

            {/* Optimizer Dropdown */}
            <div className="flex flex-col items-center justify-center w-full">
              <label className="text-xs font-semibold text-gray-700 text-center mb-1">
                Optimizer:
              </label>
              <select
                className="w-full p-1 text-sm text-center text-black border-2 border-blue-200 rounded-full outline-none focus:border-blue-400 transition-colors"
                value={optimizer}
                onChange={(e) => {
                  setOptimizer(e.target.value);
                  handleChange("optimizer", e.target.value);
                }}
              >
                <option value="COBYLA">COBYLA</option>
                <option value="SPSA">SPSA</option>
                <option value="NELDER_MEAD">Nelder-Mead</option>
              </select>
            </div>

            {/* Layers (p) Input */}
            <div className="flex flex-col items-center justify-center w-full">
              <label className="text-xs font-semibold text-gray-700 text-center mb-1">
                Layers (p):
              </label>
              <input
                type="number"
                min="1"
                className="w-full p-1 text-sm text-center text-black border-2 border-blue-200 rounded-full outline-none focus:border-blue-400 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={p}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10) || 1;
                  if (value < 1 || Number.isNaN(value)) {
                    setP(1);
                    handleChange("p", 1);
                    return;
                  }

                  setP(value);
                  handleChange("p", value);
                }}
              />
            </div>

            {/* CLASSICAL REGISTER INPUT PORTS */}
            <div className="relative left-0 w-full flex flex-col gap-2 justify-start mt-2">
              {/* Edges Port */}
              <div
                className="relative p-2"
                style={{
                  backgroundColor: classicalConstructColor || "#fed7aa",
                  width: "120px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  borderTopRightRadius: "20px",
                  borderBottomRightRadius: "20px",
                  marginLeft: "-16px",
                }}
              >
                <Handle
                  type="target"
                  id={`classicalHandleQAOAInput0${id}`}
                  position={Position.Left}
                  className="z-10 classical-circle-port-operation !bg-orange-300 !border-black -left-[6px]"
                  style={{
                    width: 12,
                    height: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                <div className="flex flex-col items-start w-full leading-tight pl-2">
                  <span className="text-black text-sm">
                    {classicalInputLabel}
                  </span>
                  <span className="text-[10px] text-gray-600">type: array</span>
                </div>
              </div>

              {/* Gamma Port */}
              <div
                className="relative p-2"
                style={{
                  backgroundColor: classicalConstructColor || "#fed7aa",
                  width: "120px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  borderTopRightRadius: "20px",
                  borderBottomRightRadius: "20px",
                  marginLeft: "-16px",
                }}
              >
                <Handle
                  type="target"
                  id={`classicalHandleQAOAInput1${id}`}
                  position={Position.Left}
                  className="z-10 classical-circle-port-operation !bg-orange-300 !border-black -left-[6px]"
                  style={{
                    width: 12,
                    height: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                <div className="flex flex-col items-start w-full leading-tight pl-2">
                  <span className="text-black text-sm">Gamma (γ)</span>
                  <span className="text-[10px] text-gray-600">type: array</span>
                </div>
              </div>

              {/* Beta Port */}
              <div
                className="relative p-2"
                style={{
                  backgroundColor: classicalConstructColor || "#fed7aa",
                  width: "120px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  borderTopRightRadius: "20px",
                  borderBottomRightRadius: "20px",
                  marginLeft: "-16px",
                }}
              >
                <Handle
                  type="target"
                  id={`classicalHandleQAOAInput2${id}`}
                  position={Position.Left}
                  className="z-10 classical-circle-port-operation !bg-orange-300 !border-black -left-[6px]"
                  style={{
                    width: 12,
                    height: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                <div className="flex flex-col items-start w-full leading-tight pl-2">
                  <span className="text-black text-sm">Beta (β)</span>
                  <span className="text-gray-600 text-[9px]">type: array</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PORT: Quantum Output Register */}
          <div className="custom-node-port-out absolute bottom-16 right-0 top-[400px]">
            <OutputPort
              node={node}
              index={0}
              type={"quantum"}
              sizeRequired={false}
              nodes={nodes}
              outputs={outputs}
              setOutputs={setOutputs}
              edges={edges}
              sizeError={sizeError}
              outputIdentifierError={
                outputIdentifierError || startsWithDigitError
              }
              updateNodeValue={updateNodeValue}
              setOutputIdentifierError={setOutputIdentifierError}
              setSizeError={setSizeError}
              setSelectedNode={setSelectedNode}
              active={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
