import { simulateThrow } from '@axe/infrastructure/dice-3d/dice-physics';
import type { DicePhysicsJob, DicePhysicsReply } from '@axe/infrastructure/dice-3d/dice-physics-message';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<DicePhysicsJob>) => void): void;
  postMessage(message: DicePhysicsReply, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { id, request } = event.data;
  try {
    const result = simulateThrow(request);
    scope.postMessage({ id, result }, [result.frames.buffer]);
  } catch {
    scope.postMessage({ id, result: null });
  }
});
