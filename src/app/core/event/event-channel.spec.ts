import { DestroyHandle, EventChannel, heldBy, StickyEventChannel } from '@axe/core/event/event-channel';

describe('EventChannel', () => {
  it('calls its listeners', () => {
    const ch = new EventChannel<number>();
    const received: number[] = [];
    ch.subscribe((v) => received.push(v));

    ch.emit(42);

    expect(received).toEqual([42]);
  });

  it('unsubscribes through the returned function', () => {
    const ch = new EventChannel<number>();
    const received: number[] = [];
    const unsub = ch.subscribe((v) => received.push(v));

    ch.emit(1);
    unsub();
    ch.emit(2);

    expect(received).toEqual([1]);
  });

  it('counts its listeners', () => {
    const ch = new EventChannel<void>();
    expect(ch.listenerCount).toBe(0);

    const unsub = ch.subscribe(() => {});
    expect(ch.listenerCount).toBe(1);

    unsub();
    expect(ch.listenerCount).toBe(0);
  });

  it('does not call a listener added mid-emit', () => {
    const ch = new EventChannel<string>();
    const calls: string[] = [];

    ch.subscribe((v) => {
      calls.push('first:' + v);
      // add a listener from inside the emit
      ch.subscribe((v2) => {
        calls.push('added:' + v2);
      });
    });

    ch.emit('A');

    // the new listener stays quiet this time round
    expect(calls).toEqual(['first:A']);

    // and fires on the next one
    ch.emit('B');
    expect(calls).toEqual(['first:A', 'first:B', 'added:B']);
  });

  it('does not call a listener unsubscribed mid-emit', () => {
    const ch = new EventChannel<number>();
    const calls: string[] = [];
    const unsub2Ref = { fn: (() => {}) as () => void };

    ch.subscribe((v) => {
      calls.push('first:' + v);
      unsub2Ref.fn();
    });
    unsub2Ref.fn = ch.subscribe((v) => {
      calls.push('second:' + v);
    });

    ch.emit(1);

    // the second was unsubscribed from inside the first, so it is skipped
    expect(calls).toEqual(['first:1']);
  });

  it('emits with nothing to carry', () => {
    const ch = new EventChannel<void>();
    let called = false;
    ch.subscribe(() => {
      called = true;
    });

    ch.emit();

    expect(called).toBe(true);
  });

  it('calls the listeners in the order they subscribed', () => {
    const ch = new EventChannel<void>();
    const order: number[] = [];

    ch.subscribe(() => order.push(1));
    ch.subscribe(() => order.push(2));
    ch.subscribe(() => order.push(3));

    ch.emit();

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('StickyEventChannel', () => {
  it('hands the last value to a listener that subscribes afterwards', () => {
    const ch = new StickyEventChannel<number>();
    const received: number[] = [];

    ch.emit(42);
    ch.subscribe((v) => received.push(v));

    expect(received).toEqual([42]);
  });

  it('hands it once to a listener that subscribed first', () => {
    const ch = new StickyEventChannel<number>();
    const received: number[] = [];

    ch.subscribe((v) => received.push(v));
    ch.emit(7);

    expect(received).toEqual([7]);
  });

  it('hands over only the last of several values', () => {
    const ch = new StickyEventChannel<string>();
    const received: string[] = [];

    ch.emit('a');
    ch.emit('b');
    ch.subscribe((v) => received.push(v));

    expect(received).toEqual(['b']);
  });

  it('hands over nothing once it has forgotten, until the next value', () => {
    const ch = new StickyEventChannel<number>();
    const received: number[] = [];

    ch.emit(1);
    ch.forget();
    ch.subscribe((v) => received.push(v));
    expect(received).toEqual([]);

    ch.emit(2);
    expect(received).toEqual([2]);
  });

  it('hands over nothing before the first emit', () => {
    const ch = new StickyEventChannel<number>();
    const received: number[] = [];

    ch.subscribe((v) => received.push(v));

    expect(received).toEqual([]);
  });

  it('keeps delivering to a listener that received the replay', () => {
    const ch = new StickyEventChannel<number>();
    const received: number[] = [];

    ch.emit(1);
    ch.subscribe((v) => received.push(v));
    ch.emit(2);

    expect(received).toEqual([1, 2]);
  });
});

/** A destroy handle that says how many callbacks it still holds. */
function fakeHandle(): DestroyHandle & { destroy(): void; readonly held: number } {
  const callbacks = new Set<() => void>();
  return {
    onDestroy(callback: () => void): () => void {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    destroy(): void {
      for (const callback of [...callbacks]) callback();
      callbacks.clear();
    },
    get held(): number {
      return callbacks.size;
    },
  };
}

describe('heldBy', () => {
  it('passes on what the channel says', () => {
    const channel = new EventChannel<number>();
    const received: number[] = [];
    heldBy(channel, fakeHandle()).subscribe((value) => received.push(value));

    channel.emit(7);

    expect(received).toEqual([7]);
  });

  it('lets go of every listener once its owner goes, though none gave a handle of its own', () => {
    const channel = new EventChannel<number>();
    const owner = fakeHandle();
    const held = heldBy(channel, owner);
    const received: number[] = [];
    held.subscribe((value) => received.push(value));
    held.subscribe((value) => received.push(value * 10));

    owner.destroy();
    channel.emit(1);

    expect(received).toEqual([]);
    expect(channel.listenerCount).toBe(0);
  });

  it('takes a listener off its owner too once the listener goes first, by hand or with its own handle', () => {
    const channel = new EventChannel<number>();
    const owner = fakeHandle();
    const caller = fakeHandle();
    const held = heldBy(channel, owner);
    const remove = held.subscribe(() => {});
    held.subscribe(() => {}, caller);

    remove();
    caller.destroy();

    expect(channel.listenerCount).toBe(0);
    expect(owner.held).toBe(0);
  });
});
