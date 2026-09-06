import {
  defaultHotbarPayload,
  encodeHotbarPayload,
  KEEP_INDEX,
  KEEP_SIZE,
  MAX_STEP_DELAY_MS,
  parseHotbarPayload,
} from '@axe/domain/hotbar/hotbar-payload';
import { HOTBAR_SLOT_KINDS } from '@axe/domain/hotbar/hotbar-slot-kind';

describe('hotbar slot payloads', () => {
  it('gives every kind something to start from', () => {
    for (const kind of HOTBAR_SLOT_KINDS) {
      expect(defaultHotbarPayload(kind)).toBeTruthy();
    }
  });

  it('reads back what it wrote', () => {
    const payload = parseHotbarPayload('turn', encodeHotbarPayload({ kind: 'turn', action: 'prev' }));

    expect(payload).toEqual({ kind: 'turn', action: 'prev' });
  });

  it('keeps the fields it understands and fills the rest in', () => {
    const payload = parseHotbarPayload('chat', '{"tab":"main","colorIndex":2}');

    expect(payload).toEqual({ kind: 'chat', tab: 'main', gameType: '', colorIndex: 2 });
  });

  it('reads the name and the size a range slot carries', () => {
    expect(parseHotbarPayload('range', '{"dock":false,"name":"火線","length":6,"width":2}')).toEqual({
      kind: 'range',
      dock: false,
      name: '火線',
      length: 6,
      width: 2,
      borderColor: '',
      fillColor: '',
      opacity: 100,
      fillOutline: false,
      rotateSnap: true,
      shiftX: false,
      shiftY: false,
    });
  });

  it('leaves a range at no size of its own where none is written down', () => {
    expect(parseHotbarPayload('range', '{"dock":true}')).toEqual({
      kind: 'range',
      dock: true,
      name: '',
      length: 0,
      width: 0,
      borderColor: '',
      fillColor: '',
      opacity: 100,
      fillOutline: false,
      rotateSnap: true,
      shiftX: false,
      shiftY: false,
    });
  });

  it('reads the colours and the painting a range slot carries', () => {
    const raw = '{"borderColor":"#112233","fillColor":"#445566","opacity":250,"fillOutline":true,"rotateSnap":false}';
    const payload = parseHotbarPayload('range', raw);

    expect(payload).toMatchObject({
      borderColor: '#112233',
      fillColor: '#445566',
      opacity: 100,
      fillOutline: true,
      rotateSnap: false,
    });
  });

  it('falls back on a value outside what the kind offers', () => {
    expect(parseHotbarPayload('effect', '{"mode":"explode"}')).toEqual({
      kind: 'effect',
      mode: 'cast',
      onSelf: false,
    });
    expect(parseHotbarPayload('turn', '{"action":42}')).toEqual({ kind: 'turn', action: 'next' });
    expect(parseHotbarPayload('chat', '{"colorIndex":-3}')).toEqual({
      kind: 'chat',
      tab: '',
      gameType: '',
      colorIndex: 0,
    });
  });

  it('shrugs off what it cannot read at all', () => {
    expect(parseHotbarPayload('sound', 'not json')).toEqual({ kind: 'sound', local: false });
    expect(parseHotbarPayload('sound', '')).toEqual({ kind: 'sound', local: false });
    expect(parseHotbarPayload('sound', null)).toEqual({ kind: 'sound', local: false });
    expect(parseHotbarPayload('sound', '"just a string"')).toEqual({ kind: 'sound', local: false });
  });

  it('writes nothing for a kind that takes no options', () => {
    expect(encodeHotbarPayload({ kind: 'plain' })).toBe('');
    expect(parseHotbarPayload('diceDeploy', '')).toEqual({ kind: 'plain' });
  });

  describe('what a multi-action waits between its steps', () => {
    it('gives each step a wait of its own', () => {
      const payload = parseHotbarPayload(
        'group',
        JSON.stringify({
          steps: [
            { page: 0, slotIndex: 0, slotIdentifier: 'a' },
            { page: 0, slotIndex: 1, slotIdentifier: 'b', delayMs: 250 },
            { page: 0, slotIndex: 2, slotIdentifier: 'c', delayMs: 1000 },
          ],
        })
      );

      expect(payload.kind === 'group' ? payload.steps.map((step) => step.delayMs) : []).toEqual([0, 250, 1000]);
    });

    it('reads a group written with one wait for the lot as that wait before each step but the first', () => {
      const payload = parseHotbarPayload(
        'group',
        JSON.stringify({
          delayMs: 400,
          steps: [
            { page: 0, slotIndex: 0, slotIdentifier: 'a' },
            { page: 0, slotIndex: 1, slotIdentifier: 'b' },
            { page: 0, slotIndex: 2, slotIdentifier: 'c' },
          ],
        })
      );

      expect(payload.kind === 'group' ? payload.steps.map((step) => step.delayMs) : []).toEqual([0, 400, 400]);
    });

    it('waits no longer than a reader will wait', () => {
      const payload = parseHotbarPayload(
        'group',
        JSON.stringify({ steps: [{ page: 0, slotIndex: 0, slotIdentifier: 'a', delayMs: 99_000 }] })
      );

      expect(payload.kind === 'group' ? payload.steps[0].delayMs : -1).toBe(MAX_STEP_DELAY_MS);
    });
  });

  describe('a look', () => {
    it('starts with every part left alone', () => {
      expect(defaultHotbarPayload('appearance')).toEqual({
        kind: 'appearance',
        image: KEEP_INDEX,
        portrait: KEEP_INDEX,
        size: KEEP_SIZE,
      });
    });

    it('reads back what it was told, and takes anything below zero as leaving it', () => {
      expect(parseHotbarPayload('appearance', JSON.stringify({ image: 2, portrait: 0, size: 3 }))).toEqual({
        kind: 'appearance',
        image: 2,
        portrait: 0,
        size: 3,
      });
      expect(parseHotbarPayload('appearance', JSON.stringify({ image: -5, portrait: 'x', size: -2 }))).toEqual({
        kind: 'appearance',
        image: KEEP_INDEX,
        portrait: KEEP_INDEX,
        size: KEEP_SIZE,
      });
    });
  });
});
