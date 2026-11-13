/**
 * What a building block does, shown in Math Mode above its intermediate steps (and in the
 * PDF export). The texts follow the circuits the backend generates (leqo-backend,
 * app/enricher) and use the block's settings, e.g. the mask of a balanced Deutsch-Jozsa
 * oracle. Markdown with $...$ math; ASCII outside of math so that pdflatex compiles it.
 */

import type { Node } from "reactflow";
import {
  DeutschJozsaNode,
  GroverDiffuserNode,
  InverseQFTNode,
  MCMTGateNode,
  OperatorNode,
  QAOANode,
  QFTNode,
  StatePreparationNode,
  UniversalOracleNode,
} from "@/constants";

const raw = String.raw;

/** Bits of `value` on `n` qubits, q0 (least significant bit) first, as in Math Mode. */
function ketQ0First(value: number, n: number): string {
  const bits = value
    .toString(2)
    .padStart(n, "0")
    .slice(-n)
    .split("")
    .reverse()
    .join("");
  return raw`|${bits}\rangle`;
}

const toInt = (v: unknown, fallback: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? fallback : n;
};

function deutschJozsa(data: Record<string, any>): string {
  const n = Math.max(1, toInt(data.numQubits, 3));
  const balanced = (data.oracleType ?? "balanced") === "balanced";
  const intro = raw`**Deutsch-Jozsa** decides with a single call of a hidden function $f: \{0,1\}^{${n}} \to \{0,1\}$ whether it is **constant** (the same output for every input) or **balanced** (output 1 for exactly half of the inputs). A classical algorithm needs up to $2^{${n}-1}+1 = ${2 ** (n - 1) + 1}$ evaluations in the worst case.

1. **Target qubit in $|-\rangle$:** X and H on an extra target qubit give $|-\rangle = \frac{1}{\sqrt{2}}(|0\rangle - |1\rangle)$.
2. **Superposition:** H on each of the ${n} query qubits gives all $2^{${n}}$ inputs at once.
3. **Oracle:** $U_f|x\rangle|y\rangle = |x\rangle|y \oplus f(x)\rangle$. Because the target is in $|-\rangle$, this becomes a **phase kickback**: $|x\rangle \mapsto (-1)^{f(x)}|x\rangle$.
4. **Interference:** H on every query qubit again. The amplitude of $|0\dots0\rangle$ is $\frac{1}{2^{${n}}}\sum_x (-1)^{f(x)}$: it is $\pm 1$ if $f$ is constant and $0$ if $f$ is balanced.

Measuring the query register therefore gives $|0\dots0\rangle$ with certainty for a constant function and never for a balanced one.`;

  if (balanced) {
    const mask = Math.max(0, toInt(data.balancedMask, 1)) % 2 ** n;
    if (mask === 0) {
      return `${intro}\n\n${raw`**This block:** the mask is $s = 0$, so the oracle contains no CNOT and $f(x) = 0$ for every input: the function is in fact constant and the query register returns to $|0\dots0\rangle$.`}`;
    }
    const used = Array.from({ length: n }, (_, i) => i)
      .filter((i) => (mask >> i) & 1)
      .map((i) => `$q_${i}$`)
      .join(", ");
    return `${intro}\n\n${raw`**This block (balanced, mask $s = ${mask}$):** $f(x) = s \cdot x \bmod 2$, the parity of the bits of $x$ where $s$ has a 1. It is built from one CNOT from each query qubit whose bit of $s$ is 1 (${used}) to the target. After the final H gates the query register is $|s\rangle = ${ketQ0First(mask, n)}$ ($q_0$ first, least significant bit). For Deutsch-Jozsa only one thing counts: the result is not $|0\dots0\rangle$, so the function is balanced. Which other bit string appears does not matter, and for an arbitrary balanced function it could even be random.

**Bonus (Bernstein-Vazirani):** that the result is exactly the mask $s$, every time, is a property of this kind of oracle, not of Deutsch-Jozsa. For a parity function $f(x) = s \cdot x \bmod 2$ all amplitude ends up on the single bit string $s$. The same circuit used to find $s$ is the Bernstein-Vazirani algorithm: here it reads $s = ${mask}$ with one call, where a classical algorithm needs ${n} calls (one per bit).

The target qubit stays in $|-\rangle$ until the end and is not part of the result: in the full state it shows up as pairs of terms with opposite signs that differ only in the target bit, e.g. $\frac{1}{\sqrt{2}}|x\rangle|0\rangle - \frac{1}{\sqrt{2}}|x\rangle|1\rangle = |x\rangle|-\rangle$.`}`;
  }
  const c = toInt(data.constantValue, 0) === 1 ? 1 : 0;
  return `${intro}\n\n${raw`**This block (constant, $f(x) = ${c}$):** ${
    c === 1
      ? raw`the oracle is a single X on the target. It flips $|-\rangle$ to $-|-\rangle$, i.e. only a global phase $-1$ that cannot be measured.`
      : "the oracle contains no gate at all."
  } The query register returns to $|0\dots0\rangle$: the function is constant.`}`;
}

const QAOA_PROBLEMS: Record<string, string> = {
  MaxCut: raw`**MaxCut:** split the nodes of a graph into two sets so that as many edges as possible run between them. Qubit $q_j$ is the set of node $j$. The cost term of an edge $(u, v)$ is $Z_u Z_v$, which is $-1$ exactly when the edge is cut; it is applied as $e^{-i\gamma Z_u Z_v}$ = CNOT, $R_Z$, CNOT.`,
  Max2SAT: raw`**Max-2-SAT:** satisfy as many clauses with two literals as possible. Qubit $q_j$ is the truth value of variable $j$. Each clause adds $R_Z$ rotations on its two variables and a $Z_u Z_v$ term (CNOT, $R_Z$, CNOT), with signs from the negated literals.`,
  GraphColoring: raw`**Graph coloring:** give neighbouring nodes different colors. Each edge $(u, v)$ adds a $Z_u Z_v$ term (CNOT, $R_Z$, CNOT) that penalizes equal colors.`,
};

function qaoa(data: Record<string, any>): string {
  const p = Math.max(1, toInt(data.p, 1));
  const problem = String(data.problem || "MaxCut");
  const gamma = String(data.gamma ?? "").trim();
  const beta = String(data.beta ?? "").trim();
  const angles =
    gamma || beta
      ? ` In this block: $\\gamma = ${gamma || "0.5"}$, $\\beta = ${beta || "0.2"}$.`
      : raw` Without given angles the backend uses $\gamma = 0.5$ and $\beta = 0.2$.`;
  return `${raw`**QAOA** (Quantum Approximate Optimization Algorithm) looks for a good solution of a combinatorial optimization problem. Every qubit is one binary variable, so each basis state is one candidate solution. The problem is written as a cost Hamiltonian $H_C$ whose low-energy basis states are good solutions.

1. **Superposition:** H on every qubit gives all candidates with the same amplitude.
2. **Cost layer** $e^{-i\gamma H_C}$: every candidate gets a phase that depends on its cost (only the phases change, not the probabilities).
3. **Mixer layer** $e^{-i\beta \sum_j X_j}$ = $R_X(2\beta)$ on every qubit: it moves amplitude between candidates, so the phases turn into different probabilities.

Steps 2 and 3 form one layer; this block has $p = ${p}$ layer${p === 1 ? "" : "s"}.

The angles $\gamma$ and $\beta$ are tuned by a classical optimizer${data.optimizer ? ` (${data.optimizer})` : ""} so that a measurement returns low-cost solutions with high probability; more layers can approximate the optimum better.`}${angles}\n\n${QAOA_PROBLEMS[problem] ?? `**Problem:** ${problem}.`}`;
}

const QFT_DESCRIPTION = raw`The **quantum Fourier transform** maps a basis state $|x\rangle$ of $n$ qubits to $\frac{1}{\sqrt{2^n}}\sum_{k=0}^{2^n-1} e^{2\pi i\,xk/2^n}|k\rangle$: the number $x$ is written into the **relative phases** of an equal superposition. It is built from an H gate on each qubit followed by controlled phase rotations $CP(\pi/2^k)$ from the following qubits, and SWAP gates that reverse the qubit order at the end. It needs only $O(n^2)$ gates, compared with $O(n 2^n)$ for the classical fast Fourier transform, and is the core of phase estimation and Shor's algorithm.`;

const INVERSE_QFT_DESCRIPTION = raw`The **inverse quantum Fourier transform** $QFT^\dagger$ undoes the QFT: it reads a number that is stored in the relative phases $\frac{1}{\sqrt{2^n}}\sum_k e^{2\pi i\,xk/2^n}|k\rangle$ back into the basis state $|x\rangle$, which can then be measured. It uses the same gates as the QFT in reverse order with negated angles ($CP(-\pi/2^k)$). Typical use: the last step of phase estimation.`;

function oracle(data: Record<string, any>): string {
  const marked = String(data.targetStates ?? "").trim();
  const list = marked ? ` Marked here: ${marked}.` : "";
  return data.mode === "boolean"
    ? raw`The **oracle** evaluates a Boolean function on the register and writes the result into a target qubit: $U_f|x\rangle|y\rangle = |x\rangle|y \oplus f(x)\rangle$, with $f(x) = 1$ exactly for the marked states.${list}`
    : raw`The **phase oracle** marks the searched states by flipping their sign: $O|x\rangle = (-1)^{f(x)}|x\rangle$, with $f(x) = 1$ exactly for the marked states. It is built from X gates on the qubits whose bit is 0 in the marked state, a multi-controlled Z, and the same X gates again. The probabilities do not change yet, only the phase of the marked states.${list} The numbers are basis states with $q_0$ as the least significant bit.`;
}

const DIFFUSER_DESCRIPTION = raw`The **diffusion operator** reflects all amplitudes about their mean: $D = 2|s\rangle\langle s| - I = H^{\otimes n}(2|0\rangle\langle 0| - I)H^{\otimes n}$, built from H, X, a multi-controlled Z, X and H. After the oracle the marked states have a negative amplitude, so they lie far below the mean: the reflection makes them grow, all other states shrink. Oracle and diffuser together are one Grover iteration.`;

function mcmt(data: Record<string, any>): string {
  const c = Math.max(1, toInt(data.numControls, 1));
  const t = Math.max(1, toInt(data.numTargets, 1));
  const u = String(data.baseGate || "X").toUpperCase();
  return raw`The **multi-controlled multi-target gate** applies $${u}$ to each of the ${t} target qubit${t === 1 ? "" : "s"} only for the basis states in which all ${c} control qubit${c === 1 ? " is" : "s are"} $|1\rangle$. All other basis states are left unchanged. Controlled gates like this create entanglement when the controls are in superposition.`;
}

function operator(data: Record<string, any>): string {
  const label = String(data.label ?? "").replace(/^Quantum\s*/, "");
  const op = data.operator ? ` (here: ${data.operator})` : "";
  return raw`The **${label}**${op} computes its result on qubit registers instead of bits. Quantum gates must be reversible, so the inputs are kept and the result is written into an extra output register: $|a\rangle|b\rangle|0\rangle \mapsto |a\rangle|b\rangle|a \circ b\rangle$. Because it is a linear operation, it acts on every basis state of a superposition at once.`;
}

const PREPARED_STATES: Record<string, string> = {
  "Uniform Superposition": raw`The **uniform superposition** is prepared with an H gate on every qubit: $H^{\otimes n}|0\dots0\rangle = \frac{1}{\sqrt{2^n}}\sum_x |x\rangle$. Every basis state has the same amplitude, which is the usual starting point of Grover, QAOA or Deutsch-Jozsa.`,
  GHZ: raw`The **GHZ state** $\frac{1}{\sqrt{2}}(|0\dots0\rangle + |1\dots1\rangle)$ is prepared with an H gate on the first qubit and a chain of CNOTs to the others. All qubits are entangled: measuring one of them fixes the result of all others.`,
  "W-State": raw`The **W state** $\frac{1}{\sqrt{n}}(|10\dots0\rangle + |010\dots0\rangle + \dots + |0\dots01\rangle)$ has exactly one qubit in $|1\rangle$, spread evenly over all qubits. Unlike GHZ, its entanglement survives when one qubit is measured or lost.`,
};

const BELL_STATES: Record<string, string> = {
  "φ+": raw`|\Phi^+\rangle = \frac{1}{\sqrt{2}}(|00\rangle + |11\rangle)`,
  "φ-": raw`|\Phi^-\rangle = \frac{1}{\sqrt{2}}(|00\rangle - |11\rangle)`,
  "ψ+": raw`|\Psi^+\rangle = \frac{1}{\sqrt{2}}(|01\rangle + |10\rangle)`,
  "ψ-": raw`|\Psi^-\rangle = \frac{1}{\sqrt{2}}(|01\rangle - |10\rangle)`,
};

function bellState(name: string): string {
  const formula = BELL_STATES[name.replace(/^Bell State\s*/, "")];
  return raw`The **Bell state**${formula ? ` $${formula}$` : ""} is one of the four maximally entangled states of two qubits, prepared with an H gate and a CNOT (and an X or Z for the other variants). Each qubit on its own is completely random, but the two measurement results are perfectly correlated.`;
}

const ENCODINGS: Record<string, string> = {
  "Angle Encoding": raw`**Angle encoding** writes each value $x_j$ into the rotation angle of one qubit, e.g. $R_Y(x_j)|0\rangle = \cos\frac{x_j}{2}|0\rangle + \sin\frac{x_j}{2}|1\rangle$. It needs one qubit per value and only single-qubit rotations, so the qubits are not entangled.`,
  "Amplitude Encoding": raw`**Amplitude encoding** writes a normalized vector of $2^n$ values into the amplitudes of $n$ qubits: $\sum_x c_x |x\rangle$ with $\sum_x |c_x|^2 = 1$. It is very compact (exponentially many values on few qubits), but preparing an arbitrary state needs many gates.`,
  "Matrix Encoding": raw`**Matrix encoding** writes the entries of a matrix into the amplitudes of a register, row by row, after normalizing them.`,
  "Schmidt Decomposition": raw`The **Schmidt decomposition** writes a state of two registers as $\sum_k \lambda_k |u_k\rangle|v_k\rangle$ with orthonormal $|u_k\rangle$, $|v_k\rangle$ and non-negative $\lambda_k$. The circuit prepares the coefficients $\lambda_k$ on the first register, copies them to the second with CNOTs and then rotates both into the bases $|u_k\rangle$ and $|v_k\rangle$.`,
};

/** Explanation of the block that generated a run of steps, or null if there is none. */
export function blockDescription(node: Node): string | null {
  const data = node.data ?? {};
  switch (node.type) {
    case DeutschJozsaNode:
      return deutschJozsa(data);
    case QAOANode:
      return qaoa(data);
    case QFTNode:
      return QFT_DESCRIPTION;
    case InverseQFTNode:
      return INVERSE_QFT_DESCRIPTION;
    case UniversalOracleNode:
      return oracle(data);
    case GroverDiffuserNode:
      return DIFFUSER_DESCRIPTION;
    case MCMTGateNode:
      return mcmt(data);
    case OperatorNode:
      return operator(data);
    case StatePreparationNode: {
      if (data.label === "Prepare State") {
        const state = String(data.quantumStateName ?? "");
        if (state.startsWith("Bell")) return bellState(state);
        return PREPARED_STATES[state] ?? null;
      }
      const encoding =
        data.label === "Encode Value" ? data.encodingType : data.label;
      return ENCODINGS[String(encoding)] ?? null;
    }
    default:
      return null;
  }
}
