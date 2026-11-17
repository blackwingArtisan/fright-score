/**
 * The eight 4-operator routing algorithms of the YM2612 family.
 * Operators are numbered 0..3 (the datasheet's OP1..OP4). Operator 0 carries self-feedback.
 * `inputs[i]` lists the operators that modulate operator i; `carriers` are summed to the output.
 * Every input index is lower than its target, so evaluating 0..3 in order is always valid.
 */
export interface Algorithm {
  readonly id: number;
  readonly inputs: readonly (readonly number[])[];
  readonly carriers: readonly number[];
  /** Human-readable routing, for the visualizer and docs. */
  readonly diagram: string;
}

export const ALGORITHMS: readonly Algorithm[] = [
  { id: 0, inputs: [[], [0], [1], [2]], carriers: [3], diagram: '1 > 2 > 3 > 4' },
  { id: 1, inputs: [[], [], [0, 1], [2]], carriers: [3], diagram: '(1 + 2) > 3 > 4' },
  { id: 2, inputs: [[], [], [1], [0, 2]], carriers: [3], diagram: '(1 + (2 > 3)) > 4' },
  { id: 3, inputs: [[], [0], [], [1, 2]], carriers: [3], diagram: '((1 > 2) + 3) > 4' },
  { id: 4, inputs: [[], [0], [], [2]], carriers: [1, 3], diagram: '(1 > 2) + (3 > 4)' },
  { id: 5, inputs: [[], [0], [0], [0]], carriers: [1, 2, 3], diagram: '1 > (2 + 3 + 4)' },
  { id: 6, inputs: [[], [0], [], []], carriers: [1, 2, 3], diagram: '(1 > 2) + 3 + 4' },
  { id: 7, inputs: [[], [], [], []], carriers: [0, 1, 2, 3], diagram: '1 + 2 + 3 + 4' },
];

export function getAlgorithm(id: number): Algorithm {
  const algo = ALGORITHMS[id];
  if (!algo) throw new Error(`Unknown FM algorithm ${id}; expected 0-7`);
  return algo;
}

export function isCarrier(algorithmId: number, op: number): boolean {
  return getAlgorithm(algorithmId).carriers.includes(op);
}
