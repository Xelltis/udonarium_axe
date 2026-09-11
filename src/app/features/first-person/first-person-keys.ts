import {
  FirstPersonLattice,
  FirstPersonMove,
  offersMove,
} from '@axe/domain/tabletop/first-person/first-person-lattice';

export type FirstPersonCommand =
  | { kind: 'move'; move: FirstPersonMove }
  | { kind: 'turn'; turn: 1 | -1 }
  | { kind: 'door' }
  | { kind: 'exit' }
  | { kind: 'target' }
  | { kind: 'clearTargets' };

export interface FirstPersonKeyContext {
  typing: boolean;
  composing: boolean;
  chord: boolean;
  busy: boolean;
  shift: boolean;
  picking: boolean;
  forced: boolean;
  lattice: FirstPersonLattice;
}

const MOVES = new Map<string, FirstPersonMove>([
  ['KeyW', 'forward'],
  ['ArrowUp', 'forward'],
  ['KeyS', 'back'],
  ['ArrowDown', 'back'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
  ['KeyZ', 'backLeft'],
  ['KeyC', 'backRight'],
]);

const TURNS = new Map<string, 1 | -1>([
  ['KeyQ', -1],
  ['ArrowLeft', -1],
  ['KeyE', 1],
  ['ArrowRight', 1],
]);

export function firstPersonKeyDown(code: string, context: FirstPersonKeyContext): FirstPersonCommand | null {
  if (context.typing || context.composing || context.chord || context.busy) return null;
  const move = MOVES.get(code);
  if (move) return offersMove(context.lattice, move) ? { kind: 'move', move } : null;
  const turn = TURNS.get(code);
  if (turn) return { kind: 'turn', turn };
  if (code === 'KeyT') return context.shift ? { kind: 'clearTargets' } : { kind: 'target' };
  if (code === 'Space') return { kind: 'door' };
  if (code === 'Escape') return context.forced || context.picking ? null : { kind: 'exit' };
  return null;
}
