import { FireInput, FirePiece, lineOfFire } from '@axe/domain/tabletop/zone/line-of-fire';

const piece = (id: string, x: number, y: number, side: string | null, zone = '', inside: string[] = []): FirePiece => ({
  id,
  point: { x, y },
  side,
  zone,
  inside,
  offField: false,
});

function input(more: Partial<FireInput> = {}): FireInput {
  return {
    shooter: piece('shooter', 0, 0, 'pc'),
    target: piece('target', 500, 0, 'npc'),
    pieces: [],
    zones: [],
    blockRadiusPx: 25,
    pxPerMetre: 50,
    clear: false,
    ...more,
  };
}

describe('lineOfFire', () => {
  it('measures the distance in metres, with nothing in the way and the target the one candidate', () => {
    expect(lineOfFire(input())).toEqual({ distanceM: 10, zones: [], pieces: [], candidates: ['target'] });
  });

  it('counts a zone the line crosses, but not the shooter’s or the target’s', () => {
    const report = lineOfFire(
      input({
        shooter: piece('shooter', 0, 0, 'pc', 'own'),
        target: piece('target', 500, 0, 'npc', 'theirs'),
        zones: [
          { id: 'own', shape: { centre: { x: 0, y: 0 }, square: false, reach: 100 }, members: ['shooter'] },
          { id: 'between', shape: { centre: { x: 250, y: 0 }, square: false, reach: 60 }, members: [] },
          {
            id: 'theirs',
            shape: { centre: { x: 500, y: 0 }, square: false, reach: 100 },
            members: ['target', 'other'],
          },
          { id: 'aside', shape: { centre: { x: 250, y: 300 }, square: false, reach: 60 }, members: [] },
        ],
      })
    );

    expect(report.zones).toEqual(['between']);
    expect(report.candidates).toEqual(['target', 'other']);
  });

  it('counts a piece out of every zone near the line, only where it is an enemy of the shooter', () => {
    const report = lineOfFire(
      input({
        pieces: [
          piece('enemy', 250, 20, 'npc'),
          piece('friend', 300, 0, 'pc'),
          piece('far', 250, 100, 'npc'),
          piece('fighting', 200, 0, 'npc', 'somewhere'),
        ],
      })
    );

    expect(report.pieces).toEqual(['enemy']);
  });

  it('counts no piece standing in a zone without being in it as in the way', () => {
    const report = lineOfFire(input({ pieces: [piece('standing', 250, 0, 'npc', '', ['somewhere'])] }));

    expect(report.pieces).toEqual([]);
  });

  it('lands only on the target when the shooter stands in its zone without being in it', () => {
    const report = lineOfFire(
      input({
        shooter: piece('shooter', 50, 0, 'pc', '', ['theirs']),
        target: piece('target', 0, 0, 'npc', 'theirs'),
        zones: [
          { id: 'theirs', shape: { centre: { x: 0, y: 0 }, square: false, reach: 100 }, members: ['target', 'other'] },
        ],
      })
    );

    expect(report.candidates).toEqual(['target']);
  });

  it('lets a shooter that fires past things see nothing in the way', () => {
    const report = lineOfFire(input({ clear: true, pieces: [piece('enemy', 250, 0, 'npc')] }));

    expect(report.pieces).toEqual([]);
  });

  it('lands only on the target when the shooter is in the same zone', () => {
    const report = lineOfFire(
      input({
        shooter: piece('shooter', 0, 0, 'pc', 'same'),
        target: piece('target', 0, 0, 'npc', 'same'),
        zones: [
          { id: 'same', shape: { centre: { x: 0, y: 0 }, square: false, reach: 100 }, members: ['shooter', 'target'] },
        ],
      })
    );

    expect(report.candidates).toEqual(['target']);
  });
});
