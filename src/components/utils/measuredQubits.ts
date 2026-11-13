/**
 * The qubits (global indices, ascending) that the measurements of a circuit read, e.g.
 * [3, 4, 5] when only the result register of an adder is measured. Math Mode then shows
 * the result on these qubits ("|101⟩ = 5") instead of the whole register ("|011101⟩ = 46").
 *
 * Works on the code of the backend (LEQO) and on plain OpenQASM:
 *   let x = leqo_reg[{0, 1, 2, 3, 4, 5}];  bit[3] r = measure x[{3, 4, 5}];
 *   bit[3] c;  c[0] = measure q[3];  …
 *   bit[6] c = measure q;      measure q[3] -> c[0];
 * Registers are numbered one after the other; aliases ("let") are resolved, also aliases
 * of aliases. Returns null if the code measures nothing or a measured operand is unknown.
 */
export function measuredQubits(qasm: string): number[] | null {
  if (!qasm) return null;
  const code = qasm
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  // registers and aliases -> global qubit indices
  const qubitsOf = new Map<string, number[]>();
  let total = 0;
  for (const m of code.matchAll(
    /\bqubit(?:\[(\d+)\])?\s+([\w.]+)\s*;|\bqreg\s+([\w.]+)\s*\[(\d+)\]\s*;/g,
  )) {
    const name = m[2] ?? m[3];
    const size = Number(m[1] ?? m[4] ?? 1);
    qubitsOf.set(
      name,
      Array.from({ length: size }, (_, i) => total + i),
    );
    total += size;
  }

  // "name", "name[i]" or "name[{i, j}]" -> global qubits, null if unknown
  const operand = /([\w.]+)\s*(?:\[\s*\{?\s*([\d\s,]+?)\s*\}?\s*\])?/.source;
  const resolve = (name: string, list: string | undefined) => {
    const all = qubitsOf.get(name);
    if (!all) return null;
    if (list === undefined) return all;
    const picked = list.split(",").map((s) => all[parseInt(s.trim(), 10)]);
    return picked.every((q) => q !== undefined) ? picked : null;
  };

  for (const m of code.matchAll(
    new RegExp(`\\blet\\s+([\\w.]+)\\s*=\\s*${operand}\\s*;`, "g"),
  )) {
    const qubits = resolve(m[2], m[3]);
    if (qubits) qubitsOf.set(m[1], qubits);
  }

  // "… = measure <operand>;" (OpenQASM 3) and "measure <operand> -> …" (OpenQASM 2)
  const measured = new Set<number>();
  let found = false;
  for (const re of [
    new RegExp(`=\\s*measure\\s+${operand}\\s*;`, "g"),
    new RegExp(`\\bmeasure\\s+${operand}\\s*->`, "g"),
  ]) {
    for (const m of code.matchAll(re)) {
      const qubits = resolve(m[1], m[2]);
      if (!qubits) return null;
      found = true;
      qubits.forEach((q) => measured.add(q));
    }
  }
  return found ? [...measured].sort((a, b) => a - b) : null;
}
