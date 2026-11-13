/** Event that asks App to open a block to its circuit level (see showCircuitLevel). */
export const SHOW_CIRCUIT_LEVEL_EVENT = "lcm-show-circuit-level";

/** `blockedReason`: why the block cannot be opened yet, shown to the user instead. */
export function requestCircuitLevel(nodeId: string, blockedReason?: string) {
  window.dispatchEvent(
    new CustomEvent(SHOW_CIRCUIT_LEVEL_EVENT, {
      detail: { nodeId, blockedReason },
    }),
  );
}

/**
 * "▸ Circuit" button in the header of a block whose gates come from the compiled model
 * (e.g. Grover Oracle, Grover Diffuser): replaces the block by the gates it compiles to.
 * With `disabledReason` the button is greyed out and the reason is shown on hover.
 */
export function CircuitLevelButton({
  nodeId,
  label,
  disabledReason,
}: {
  nodeId: string;
  label: string;
  disabledReason?: string;
}) {
  const disabled = !!disabledReason;
  return (
    <button
      // aria-disabled instead of disabled: a disabled button gets no hover events, so
      // its tooltip would not show in every browser
      aria-disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        // a click on the disabled button says what is still missing
        requestCircuitLevel(nodeId, disabledReason);
      }}
      className={`nodrag flex-shrink-0 ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-700 text-blue-900 bg-white/70 transition-colors whitespace-nowrap ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white"
      }`}
      title={
        disabledReason ??
        `Show the circuit-level model of the ${label}: a group with only the qubits and gates it compiles to. Collapse the group to get the block back.`
      }
    >
      ▸ Circuit
    </button>
  );
}
