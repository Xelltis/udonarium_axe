import {
  FirstPersonLattice,
  FirstPersonMove,
  offersMove,
} from '@axe/domain/tabletop/first-person/first-person-lattice';

export type FirstPersonCommand =
  | { kind: 'move'; move: FirstPersonMove }
  | { kind: 'turn'; turn: 1 | -1 }
  | { kind: 'door' }
  | { kind: 'torch' }
  | { kind: 'exit' }
  | { kind: 'target' }
  | { kind: 'clearTargets' }
  | { kind: 'castPicks' }
  | { kind: 'cancelPicks' }
  | { kind: 'endLook' };

export interface FirstPersonKeyContext {
  typing: boolean;
  composing: boolean;
  chord: boolean;
  busy: boolean;
  shift: boolean;
  picking: boolean;
  forced: boolean;
  lattice: FirstPersonLattice;
  /** Whether the view is dragged about or left looking away, which Escape brings back ahead before anything else. */
  looking?: boolean;
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
  if (code === 'Enter' || code === 'NumpadEnter') return context.picking ? { kind: 'castPicks' } : null;
  if (code === 'Space') return { kind: 'door' };
  if (code === 'KeyF') return { kind: 'torch' };
  if (code === 'Escape') {
    if (context.looking) return { kind: 'endLook' };
    if (context.picking) return { kind: 'cancelPicks' };
    return context.forced ? null : { kind: 'exit' };
  }
  return null;
}
