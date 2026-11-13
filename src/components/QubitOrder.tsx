/**
 * Qubit order of the Dirac notation in Math Mode: q0 is written leftmost, but it is the
 * least significant bit (as in the backend and Qiskit). A basis encoding of 6 = 110₂
 * therefore reads |011⟩, which would be 3 when read as an ordinary binary number.
 */

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) =>
  String(n)
    .split("")
    .map((d) => SUBSCRIPTS[Number(d)])
    .join("");

/** Number of a basis state written with q0 leftmost (q0 = least significant bit). */
export function basisValue(bits: string): number {
  return parseInt(bits.split("").reverse().join("") || "0", 2);
}

/**
 * The bits of a state that is a single basis state, e.g. "|011⟩", "-|011⟩" or
 * "i|011⟩" (a global phase does not change the number); null for a superposition.
 */
export function singleBasisState(unicode: string | undefined): string | null {
  const match = unicode?.trim().match(/^[-−+]?\s*(?:[-−]?\s*i\s*)?\|([01]+)⟩$/);
  return match ? match[1] : null;
}

/** " = 6" for a single basis state, otherwise "". */
export function basisValueSuffix(unicode: string | undefined): string {
  const bits = singleBasisState(unicode);
  return bits && bits.length > 1 ? ` = ${basisValue(bits)}` : "";
}

/** Short explanation of the qubit order, e.g. "|q₀q₁q₂⟩ … |011⟩ = 6". */
export function QubitOrderNote({ numQubits }: { numQubits: number }) {
  if (numQubits < 2) return null;
  const n = Math.min(numQubits, 8);
  const order = Array.from({ length: n }, (_, q) => `q${sub(q)}`).join("");
  const weights = Array.from(
    { length: Math.min(n, 4) },
    (_, q) =>
      `b${sub(q)}·2${q === 0 ? "⁰" : q === 1 ? "¹" : q === 2 ? "²" : "³"}`,
  ).join(" + ");
  // example: the number 2^(n-1) + 2^(n-2), e.g. 6 for 3 qubits, written q0 first
  const example = n >= 3 ? 2 ** (n - 1) + 2 ** (n - 2) : 2;
  const exampleBits = example
    .toString(2)
    .padStart(n, "0")
    .split("")
    .reverse()
    .join("");
  return (
    <p className="text-[11px] text-gray-500 leading-snug">
      <span className="font-semibold">Qubit order:</span>{" "}
      <span className="font-mono">|{order}⟩</span>. q₀ is written first but is
      the <span className="font-semibold">least significant bit</span>, so a
      basis state is the number {weights}
      {n > 4 ? " + …" : ""}, e.g.{" "}
      <span className="font-mono">
        |{exampleBits}⟩ = {example}
      </span>{" "}
      (read as an ordinary binary number it would look like{" "}
      {parseInt(exampleBits, 2)}).
    </p>
  );
}
