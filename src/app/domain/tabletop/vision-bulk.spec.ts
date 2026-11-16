import { bulkVisionTarget, disagreeingVisionFields, VisionBulkMember } from '@axe/domain/tabletop/vision-bulk';
import { applyVisionShape, VisionShape } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

function piece(overrides: Partial<VisionBulkMember> = {}): VisionBulkMember & { updates: number } {
  return {
    updates: 0,
    update(): void {
      (this as { updates: number }).updates++;
    },
    lightEnabled: false,
    lightPreset: 'custom',
    lightBrightRadius: 0,
    lightDimRadius: 0,
    lightColor: '#ffffff',
    lightAngle: 360,
    lightDirection: 0,
    lightAnimation: 'none',
    visionType: VisionType.NORMAL,
    visionRange: 0,
    visionShape: VisionShape.DOME,
    visionConeAngle: 90,
    visionConeCount: 2,
    visionBackAngle: 60,
    visionBackScale: 0.5,
    visionPeripheralScale: 0.5,
    visionDirection: 0,
    visionLobes: '',
    showVisionRange: false,
    castsShadow: true,
    ...overrides,
  } as VisionBulkMember & { updates: number };
}

describe('bulkVisionTarget', () => {
  it('reads a field from the first of them', () => {
    const target = bulkVisionTarget([piece({ visionRange: 4 }), piece({ visionRange: 9 })]);
    expect(target.visionRange).toBe(4);
  });

  it('names the pieces that have an identifier, to be followed by', () => {
    const target = bulkVisionTarget([piece({ identifier: 'a' }), piece(), piece({ identifier: 'c' })]);

    expect(target.identifiers).toEqual(['a', 'c']);
  });

  it('writes a field to every one of them', () => {
    const a = piece();
    const b = piece();
    const target = bulkVisionTarget([a, b]);

    target.visionType = VisionType.DARKVISION;
    target.visionRange = 6;

    expect([a.visionType, b.visionType]).toEqual([VisionType.DARKVISION, VisionType.DARKVISION]);
    expect([a.visionRange, b.visionRange]).toEqual([6, 6]);
  });

  it('leaves a field nobody touched as each piece had it', () => {
    const a = piece({ visionRange: 4 });
    const b = piece({ visionRange: 9 });
    const target = bulkVisionTarget([a, b]);

    target.visionType = VisionType.TRUESIGHT;

    expect([a.visionRange, b.visionRange]).toEqual([4, 9]);
  });

  it('carries a shape chosen once to every one of them, fields and all', () => {
    const a = piece();
    const b = piece();
    const target = bulkVisionTarget([a, b]);

    applyVisionShape(target, VisionShape.CONE);

    expect(a.visionShape).toBe(VisionShape.CONE);
    expect(b.visionShape).toBe(VisionShape.CONE);
    expect(b.visionConeAngle).toBe(a.visionConeAngle);
  });

  it('tells every one of them that it changed', () => {
    const a = piece();
    const b = piece();

    bulkVisionTarget([a, b]).update();

    expect([a.updates, b.updates]).toEqual([1, 1]);
  });

  it('answers for nothing at all without falling over', () => {
    const target = bulkVisionTarget([]);
    expect(target.visionRange).toBeUndefined();
    expect(() => target.update()).not.toThrow();
    expect(() => (target.visionRange = 3)).not.toThrow();
  });
});

describe('disagreeingVisionFields', () => {
  it('finds nothing when they already agree', () => {
    expect(disagreeingVisionFields([piece(), piece()])).toEqual([]);
  });

  it('finds nothing for a single piece, which agrees with itself', () => {
    expect(disagreeingVisionFields([piece({ visionRange: 4 })])).toEqual([]);
  });

  it('names each field they are of two minds about', () => {
    const fields = disagreeingVisionFields([
      piece({ visionRange: 4, visionType: VisionType.NORMAL }),
      piece({ visionRange: 9, visionType: VisionType.BLIND }),
    ]);
    expect(fields).toEqual(['visionType', 'visionRange']);
  });
});
