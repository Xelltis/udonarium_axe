import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EFFECT_KINDS, EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  AIMED_EFFECT_KINDS,
  BALLISTIC_DIVE_END,
  CENTERED_EFFECT_KINDS,
  effectLandingTimes,
  effectSprites,
  impactSoundTimes,
  isEffectFinished,
  launchSoundTimes,
  seededRandom,
  swingTiltOf,
} from '@axe/domain/effect/effect-timeline';

describe('effectSprites()', () => {
  interface PresetOverrides {
    staggerMs?: number;
    scale?: number;
  }

  function makePreset(kind: EffectKind, overrides: PresetOverrides = {}): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.durationMs = 1000;
    preset.staggerMs = overrides.staggerMs ?? 0;
    preset.scale = overrides.scale ?? 1;
    return preset;
  }

  function makeCast(targetCount = 1): EffectCast {
    return {
      presetIdentifier: 'preset',
      casterIdentifier: '',
      origin: null,
      seed: 7,
      targets: Array.from({ length: targetCount }, (_unused, index) => ({
        identifier: `char${index}`,
        x: index * 100,
        y: 0,
        z: 0,
      })),
    };
  }

  const options = { baseSize: 50 };

  it('draws nothing before it starts or after it ends', () => {
    const preset = makePreset('burst');
    const cast = makeCast();

    expect(effectSprites(preset, cast, -1, options)).toHaveLength(0);
    expect(effectSprites(preset, cast, 1001, options)).toHaveLength(0);
  });

  it('returns sprites for every kind while it plays', () => {
    const cast = makeCast();

    // Some kinds, such as the cap of a mushroom cloud, leave the end to the particles, so this watches up to the height of it.
    for (const kind of EFFECT_KINDS) {
      for (const elapsed of [1, 300, 600]) {
        expect(effectSprites(makePreset(kind), cast, elapsed, options).length).toBeGreaterThan(0);
      }
    }
  });

  it('never jumps a particle as the time passes, whatever the kind', () => {
    const cast = makeCast();

    for (const kind of EFFECT_KINDS) {
      const preset = makePreset(kind);
      const before = effectSprites(preset, cast, 500, options);
      const after = effectSprites(preset, cast, 505, options);
      const shared = after.filter((sprite) => before.some((old) => old.key === sprite.key));

      for (const sprite of shared) {
        const old = before.find((candidate) => candidate.key === sprite.key)!;
        expect(Math.abs(sprite.x + sprite.offsetX - (old.x + old.offsetX))).toBeLessThan(options.baseSize);
        expect(Math.abs(sprite.y - old.y)).toBeLessThan(options.baseSize);
        expect(Math.abs(sprite.offsetY - old.offsetY)).toBeLessThan(options.baseSize);
      }
    }
  });

  it('keeps the animation of a part the same from frame to frame', () => {
    const cast = makeCast();

    for (const kind of EFFECT_KINDS) {
      const preset = makePreset(kind);
      const before = effectSprites(preset, cast, 300, options).filter((sprite) => sprite.animation.length > 0);
      const after = effectSprites(preset, cast, 420, options);

      for (const sprite of before) {
        const later = after.find((candidate) => candidate.key === sprite.key);
        // Changing it partway rewinds the animation.
        if (later) expect(later.animation).toBe(sprite.animation);
      }
    }
  });

  it('keeps the drawing the same as the time passes', () => {
    const cast = makeCast();

    for (const kind of EFFECT_KINDS) {
      const preset = makePreset(kind);
      const before = effectSprites(preset, cast, 300, options).filter((sprite) => sprite.svg.length > 0);
      const after = effectSprites(preset, cast, 420, options);

      for (const sprite of before) {
        const later = after.find((candidate) => candidate.key === sprite.key);
        // Changing it every frame would rebuild the markup and rewind the animation with it.
        if (later) expect(later.svg).toBe(sprite.svg);
      }
    }
  });

  it('builds the lightning as one unbroken line', () => {
    const sprites = effectSprites(makePreset('bolt'), makeCast(), 100, options);
    const channel = sprites.find((sprite) => sprite.key.endsWith('-channel'));

    expect(channel?.svg).toContain('<path');
    expect(channel?.svg.match(/M[\d.]+ [\d.]+/g)?.length).toBeGreaterThan(1);
    expect(channel?.animation).toContain('effectBoltStrike');
  });

  it('looses the shots of a burst one after another rather than all at once', () => {
    const preset = makePreset('projectile');
    preset.projectileStyle = 'bullet';
    preset.shots = 6;
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const flyingAt = (elapsed: number) =>
      effectSprites(preset, cast, elapsed, options).filter((sprite) => sprite.key.endsWith('-shot')).length;

    // They fly fast, so one or two are in the air at any moment, without a gap until the burst ends.
    expect(flyingAt(20)).toBe(1);
    expect(flyingAt(400)).toBeGreaterThan(0);
    // At the end the last of them is about to land.
    expect(flyingAt(999)).toBe(1);
  });

  it('lands each shot of a burst in turn', () => {
    const preset = makePreset('projectile');
    preset.shots = 5;
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const impacts = (elapsed: number) =>
      new Set(
        effectSprites(preset, cast, elapsed, options)
          .filter((sprite) => sprite.key.includes('-impact-'))
          .map((sprite) => sprite.key.split('-impact-')[0])
      ).size;

    expect(impacts(400)).toBeGreaterThan(0);
    expect(impacts(900)).toBeGreaterThan(impacts(400));
  });

  it('flies a projectile from its origin to its target', () => {
    const preset = makePreset('projectile');
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const headAt = (elapsed: number) =>
      effectSprites(preset, cast, elapsed, options).find((sprite) => sprite.key.endsWith('-core'))!;

    const early = headAt(60);
    const late = headAt(280);

    expect(early.x).toBeLessThan(0);
    expect(late.x).toBeGreaterThan(early.x);
    // It lands on the target and goes no further.
    expect(late.x).toBeLessThanOrEqual(0);
  });

  it('throws the ring only once it lands', () => {
    const preset = makePreset('projectile');
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const impactAt = (elapsed: number) =>
      effectSprites(preset, cast, elapsed, options).some((sprite) => sprite.key.includes('-impact-'));

    expect(impactAt(150)).toBe(false);
    expect(impactAt(700)).toBe(true);
  });

  it('flies an arrow and a bullet as solid things rather than lights', () => {
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: -400, z: 0 } };

    for (const style of ['arrow', 'bullet']) {
      const preset = makePreset('projectile');
      preset.projectileStyle = style;
      const shot = effectSprites(preset, cast, 120, options).find((sprite) => sprite.key.endsWith('-shot'))!;

      expect(shot.svg).toContain('<svg');
      // It faces the camera and is turned to where it flies on the screen.
      expect(shot.flat).toBe(false);
      expect(Number.isFinite(shot.rotate)).toBe(true);
      expect(shot.shadow).toBe('');
    }
  });

  it('gives a projectile a head drawn out along its flight and an unbroken trail', () => {
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const spritesFor = (style: string) => {
      const preset = makePreset('projectile');
      preset.projectileStyle = style;
      return effectSprites(preset, cast, 120, options);
    };

    const bolt = spritesFor('bolt');
    const streak = bolt.find((sprite) => sprite.key.endsWith('-streak'))!;
    // The head is long rather than round, so the speed reads even in a still.
    expect(streak.width).toBeGreaterThan(streak.height * 2);
    expect(bolt.filter((sprite) => sprite.key.includes('-ribbon-')).length).toBeGreaterThan(3);

    // The joints of the trail point much the same way; scattered, the path reads as broken.
    const angles = bolt.filter((sprite) => sprite.key.includes('-ribbon-')).map((sprite) => sprite.rotate);
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(6);

    expect(spritesFor('arrow').some((sprite) => sprite.key.endsWith('-shot'))).toBe(true);
  });

  it('runs the current unbroken from its origin to its target', () => {
    const preset = makePreset('arc');
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const cores = effectSprites(preset, cast, 100, options).filter((sprite) => sprite.key.endsWith('-core'));

    expect(cores.length).toBeGreaterThan(5);

    // Its joints run in order from one to the other, and carry depth, so the pieces between sit properly in front and behind.
    const xs = cores.map((sprite) => sprite.x);
    for (let index = 1; index < xs.length; index++) expect(xs[index]).toBeGreaterThan(xs[index - 1]);
    expect(xs[0]).toBeGreaterThan(-400);
    expect(xs[xs.length - 1]).toBeLessThan(0);
  });

  it('makes the current zigzag', () => {
    const preset = makePreset('arc');
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };
    const angles = effectSprites(preset, cast, 100, options)
      .filter((sprite) => sprite.key.endsWith('-core'))
      .map((sprite) => sprite.rotate);

    // All at one angle it would be a straight line.
    expect(new Set(angles.map((angle) => Math.round(angle))).size).toBeGreaterThan(2);
  });

  it('takes it away once it has run', () => {
    const preset = makePreset('arc');
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };

    expect(effectSprites(preset, cast, 800, options).some((sprite) => sprite.key.endsWith('-core'))).toBe(false);
  });

  it('changes the landing by the element', () => {
    const preset = makePreset('projectile');
    preset.impactKind = 'frost';
    const cast: EffectCast = { ...makeCast(), origin: { x: -400, y: 0, z: 0 } };

    const sprites = effectSprites(preset, cast, 700, options);

    expect(sprites.some((sprite) => sprite.key.includes('-impact-frost-ring'))).toBe(true);
  });

  it('comes down at an angle when there is no origin', () => {
    const sprites = effectSprites(makePreset('projectile'), makeCast(), 60, options);
    const head = sprites.find((sprite) => sprite.key.endsWith('-core'))!;

    expect(head.z).toBeGreaterThan(0);
  });

  it('gives every sprite a key of its own', () => {
    const sprites = effectSprites(makePreset('burst'), makeCast(3), 300, options);
    const keys = new Set(sprites.map((sprite) => sprite.key));

    expect(keys.size).toBe(sprites.length);
  });

  it('delays the later targets by the stagger', () => {
    const preset = makePreset('burst', { staggerMs: 400 });
    const cast = makeCast(2);

    const early = effectSprites(preset, cast, 100, options);
    expect(early.every((sprite) => sprite.key.startsWith('0-'))).toBe(true);

    const late = effectSprites(preset, cast, 500, options);
    expect(late.some((sprite) => sprite.key.startsWith('1-'))).toBe(true);
  });

  it('draws nothing on a target that is hidden', () => {
    const sprites = effectSprites(makePreset('burst'), makeCast(2), 300, {
      ...options,
      hiddenIdentifiers: new Set(['char0']),
    });

    expect(sprites.every((sprite) => sprite.key.startsWith('1-'))).toBe(true);
  });

  it('draws at the current position when it is told to follow', () => {
    const sprites = effectSprites(makePreset('burst'), makeCast(), 100, {
      ...options,
      resolvePosition: () => ({ x: 640, y: 480, z: 0 }),
    });

    expect(sprites[0].x).toBe(640);
    expect(sprites[0].y).toBe(480);
  });

  it('draws where it was fired when it is not', () => {
    const preset = makePreset('burst');
    preset.followTarget = false;
    const sprites = effectSprites(preset, makeCast(), 100, {
      ...options,
      resolvePosition: () => ({ x: 640, y: 480, z: 0 }),
    });

    expect(sprites[0].x).toBe(0);
  });

  it('arranges the same way from the same seed', () => {
    const preset = makePreset('burst');
    const first = effectSprites(preset, makeCast(), 400, options);
    const second = effectSprites(preset, makeCast(), 400, options);

    expect(first).toEqual(second);
  });

  it('lays the ring of a shock wave flat on the board', () => {
    const sprites = effectSprites(makePreset('impact'), makeCast(), 200, options);
    const shocks = sprites.filter((sprite) => sprite.key.includes('-shock-'));

    expect(shocks.length).toBeGreaterThan(0);
    expect(shocks.every((sprite) => sprite.flat)).toBe(true);
  });

  describe('the heaviest beam', () => {
    const beamCast: EffectCast = {
      presetIdentifier: 'preset',
      casterIdentifier: 'caster',
      origin: { x: -600, y: 0, z: 0 },
      seed: 7,
      targets: [{ identifier: 'char0', x: 0, y: 0, z: 0 }],
    };

    function beamAt(elapsed: number) {
      return effectSprites(makePreset('beam'), beamCast, elapsed, options);
    }

    function segmentsAt(elapsed: number) {
      return beamAt(elapsed).filter((sprite) => /-beam-\d+-core$/.test(sprite.key));
    }

    it('gathers the light at the muzzle rather than raising the column while it charges', () => {
      const charging = beamAt(150);

      expect(segmentsAt(150)).toHaveLength(0);
      expect(charging.some((sprite) => sprite.key.endsWith('-beam-charge'))).toBe(true);
    });

    it('crushes that gathered light just before it fires', () => {
      const swollen = beamAt(200).find((sprite) => sprite.key.endsWith('-beam-charge'))!;
      const snapped = beamAt(275).find((sprite) => sprite.key.endsWith('-beam-charge'))!;

      // It swells and then shrinks once; without that gathering the shot comes out of nowhere.
      expect(snapped.width).toBeLessThan(swollen.width * 0.5);
    });

    it('does not string the column together like beads', () => {
      const segments = segmentsAt(600);
      expect(segments.length).toBeGreaterThan(1);

      for (const segment of segments) {
        // Rounding the end of each section makes it read as a row of beads.
        expect(segment.borderRadius).toBe('0');
      }
      for (let index = 1; index < segments.length; index++) {
        const step = Math.abs(segments[index].height - segments[index - 1].height);
        expect(step).toBeLessThan(segments[index - 1].height * 0.1);
      }
    });

    it('lays wider, fainter layers outwards', () => {
      const sprites = beamAt(600);
      const core = sprites.find((sprite) => sprite.key === '0-beam-5-core')!;
      const halo = sprites.find((sprite) => sprite.key === '0-beam-5-halo')!;

      expect(halo.height).toBeGreaterThan(core.height * 3);
      expect(halo.opacity).toBeLessThan(core.opacity);
    });

    it('draws the end of the shot up from the foot', () => {
      const muzzleSide = (elapsed: number) =>
        segmentsAt(elapsed).filter((sprite) => sprite.x < beamCast.origin!.x / 2).length;

      expect(muzzleSide(600)).toBeGreaterThan(0);
      // Rather than thinning evenly it goes out from the foot upwards, as though spent.
      expect(muzzleSide(960)).toBe(0);
      expect(segmentsAt(960).length).toBeGreaterThan(0);
    });

    it('throws a splash back at the far end', () => {
      const sprites = beamAt(600);

      expect(sprites.some((sprite) => sprite.key.endsWith('-beam-splash-0'))).toBe(true);
      expect(sprites.some((sprite) => sprite.key.endsWith('-beam-helix-0-0'))).toBe(true);
    });
  });

  describe('a breath', () => {
    const breathCast: EffectCast = {
      presetIdentifier: 'preset',
      casterIdentifier: 'caster',
      origin: { x: -400, y: 0, z: 0 },
      seed: 7,
      targets: [{ identifier: 'char0', x: 0, y: 0, z: 0 }],
    };

    function breathAt(elapsed: number) {
      return effectSprites(makePreset('breath'), breathCast, elapsed, options);
    }

    function coneAt(elapsed: number) {
      return breathAt(elapsed).filter((sprite) => sprite.key.includes('-breath-cone-'));
    }

    it('draws the cone as one shape', () => {
      const cone = coneAt(500);

      // Split into sections, the differences between them show as seams.
      expect(cone).toHaveLength(3);
      for (const layer of cone) {
        expect(layer.svg.length).toBeGreaterThan(0);
        expect(layer.background).toBe('');
      }
    });

    it('lays a different outline on each layer', () => {
      const [haze, body, core] = coneAt(500);

      expect(haze.height).toBeGreaterThan(body.height);
      expect(body.height).toBeGreaterThan(core.height);
      expect(new Set(coneAt(500).map((layer) => layer.svg)).size).toBe(3);
    });

    it('has not reached the tip as it begins', () => {
      expect(coneAt(60)[0].width).toBeLessThan(coneAt(500)[0].width);
    });

    it('thins and scatters as it ends', () => {
      const sustained = coneAt(500)[0];
      const fading = coneAt(980)[0];

      expect(fading.opacity).toBeLessThan(sustained.opacity * 0.5);
      expect(fading.height).toBeGreaterThan(sustained.height);
    });

    it('keeps the flow at one speed however long it runs', () => {
      // Driven by the playback position, a longer breath moves more slowly inside and loses its force.
      const shortPreset = makePreset('breath');
      shortPreset.durationMs = 1000;
      const longPreset = makePreset('breath');
      longPreset.durationMs = 3000;

      const streaksOf = (preset: EffectPreset, elapsed: number) =>
        effectSprites(preset, breathCast, elapsed, options)
          .filter((sprite) => sprite.key.includes('-breath-streak-'))
          .map((sprite) => [Math.round(sprite.x * 1000) || 0, Math.round(sprite.y * 1000) || 0]);

      // The same elapsed time should carry it the same distance.
      expect(streaksOf(shortPreset, 520)).toEqual(streaksOf(longPreset, 520));
      expect(streaksOf(shortPreset, 640)).toEqual(streaksOf(longPreset, 640));
      expect(streaksOf(shortPreset, 520)).not.toEqual(streaksOf(shortPreset, 640));
    });

    it('scatters different particles along the way by element', () => {
      const moteAt = (tagName: string) => {
        const preset = makePreset('breath');
        preset.tagName = tagName;
        return effectSprites(preset, breathCast, 500, options).filter((sprite) => sprite.key.includes('-breath-mote-'));
      };

      // Shape and colour alone would look like the same thing flying in different colours.
      expect(moteAt('氷').some((mote) => mote.svg.length > 0)).toBe(true);
      expect(moteAt('雷').some((mote) => mote.svg.length > 0)).toBe(true);
      expect(moteAt('炎').every((mote) => mote.svg.length < 1)).toBe(true);
      expect(moteAt('風')[0].borderRadius).toBe('60% 0 60% 0');
      expect(moteAt('闇')[0].background).toContain('#120c18');
    });

    it('shows none where it is told to show none', () => {
      const preset = makePreset('breath');
      preset.moteStyle = 'none';

      const sprites = effectSprites(preset, breathCast, 500, options);

      expect(sprites.some((sprite) => sprite.key.includes('-breath-mote-'))).toBe(false);
    });

    it('puts a swirl at the rim and a curl back on the struck face', () => {
      const sprites = breathAt(500);

      expect(sprites.some((sprite) => sprite.key.endsWith('-breath-lobe-0'))).toBe(true);
      expect(sprites.some((sprite) => sprite.key.endsWith('-breath-splash-0'))).toBe(true);
    });
  });

  it('swells the absorption across the path rather than along it', () => {
    // With the origin directly above the target on the screen.
    const cast: EffectCast = {
      presetIdentifier: 'preset',
      casterIdentifier: 'caster',
      origin: { x: 0, y: -400, z: 0 },
      seed: 7,
      targets: [{ identifier: 'char0', x: 0, y: 0, z: 0 }],
    };
    const motes = effectSprites(makePreset('drain'), cast, 400, options).filter((sprite) =>
      /-drain-\d+$/.test(sprite.key)
    );

    // Offset along the world axis, it would only move back and forth along the path.
    expect(motes.some((mote) => Math.abs(mote.offsetX) > 1)).toBe(true);
  });

  describe('being knocked down', () => {
    function defeatSprites(kind: EffectKind, elapsed: number, image = 'blob:token') {
      return effectSprites(makePreset(kind), makeCast(), elapsed, { ...options, resolveImage: () => image });
    }

    it('cuts the picture of the piece apart and scatters it', () => {
      const pieces = defeatSprites('dissolve', 600).filter((sprite) => sprite.key.includes('-dissolve-piece-'));

      // Particles of light alone only vanish; the picture itself has to break.
      expect(pieces.length).toBeGreaterThan(8);
      for (const piece of pieces) {
        expect(piece.background).toContain('blob:token');
        expect(piece.clipPath).toContain('inset(');
      }
      // The fragments do not stay put.
      expect(new Set(pieces.map((piece) => `${piece.offsetX}/${piece.offsetY}`)).size).toBe(pieces.length);
    });

    it('breaks a piece with no picture into shards of light', () => {
      const sprites = defeatSprites('dissolve', 600, '');

      expect(sprites.some((sprite) => sprite.key.includes('-dissolve-piece-'))).toBe(false);
      expect(sprites.some((sprite) => sprite.key.includes('-dissolve-shard-'))).toBe(true);
    });

    it('cuts a piece in two and slides the halves apart', () => {
      const halves = defeatSprites('bisect', 700).filter((sprite) => /-bisect-(upper|lower)$/.test(sprite.key));

      expect(halves).toHaveLength(2);
      expect(halves[0].clipPath).toContain('polygon(');
      // They slide opposite ways.
      expect(Math.sign(halves[0].offsetX)).not.toBe(Math.sign(halves[1].offsetX));
    });

    it('spurts blood from the cut', () => {
      const sprites = defeatSprites('bisect', 700);

      expect(sprites.some((sprite) => sprite.key.includes('-bisect-gush-'))).toBe(true);
      expect(sprites.some((sprite) => sprite.key.endsWith('-bisect-seam'))).toBe(true);
    });

    it('spurts it in pulses', () => {
      const early = defeatSprites('gore', 120).filter((sprite) => sprite.key.includes('-gore-jet-')).length;
      const later = defeatSprites('gore', 420).filter((sprite) => sprite.key.includes('-gore-jet-')).length;

      // It does not end in one; it comes up with the heartbeat.
      expect(later).toBeGreaterThan(early);
    });

    it('does not leave the blood as a perfect round stain', () => {
      const stains = defeatSprites('gore', 600).filter((sprite) => sprite.key.includes('-gore-stain-'));

      expect(stains.length).toBeGreaterThan(4);
      expect(new Set(stains.map((stain) => Math.round(stain.width))).size).toBeGreaterThan(1);
    });
  });

  it('stands anything that rises on the feet of the target', () => {
    const column = effectSprites(makePreset('warp'), makeCast(), 300, options).find((sprite) =>
      sprite.key.endsWith('-warp-column')
    )!;

    // Raised along the world axis it parts from the circle at the feet as the board tilts.
    // It rises within the billboard, so the foot of the column sits on the feet of the target.
    expect(column.flat).toBe(false);
    expect(column.z).toBe(0);
    expect(column.offsetY).toBeCloseTo(-column.height / 2);
  });

  it('changes the number of strokes with the form', () => {
    const bladesFor = (style: string) => {
      const preset = makePreset('slash');
      preset.slashStyle = style;
      return effectSprites(preset, makeCast(), 300, options).filter((sprite) => sprite.key.includes('-blade-'));
    };

    // A combination is five strokes and everything else one, which the form decides rather than the grade.
    expect(bladesFor('single')).toHaveLength(1);
    expect(bladesFor('combo')).toHaveLength(5);
    expect(bladesFor('iai')).toHaveLength(1);
    expect(bladesFor('wide')).toHaveLength(1);
    expect(bladesFor('heavy')).toHaveLength(1);
  });

  it('gives each form its own line', () => {
    const bladeFor = (style: string) => {
      const preset = makePreset('slash');
      preset.slashStyle = style;
      return effectSprites(preset, makeCast(), 600, options).find((sprite) => sprite.key.endsWith('-blade-0'))!;
    };

    // A sweep runs across and a cleave down; reused, they would come out the same.
    expect(Math.abs(bladeFor('wide').rotate)).toBeLessThan(30);
    expect(Math.abs(bladeFor('heavy').rotate)).toBeGreaterThan(60);
    // A drawing cut is the thinnest and the longest.
    expect(bladeFor('iai').width).toBeGreaterThan(bladeFor('heavy').width);
    expect(bladeFor('iai').height).toBeLessThan(bladeFor('heavy').height);
  });

  it('holds a drawing cut until it flashes in an instant', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'iai';
    const keysAt = (elapsed: number) => effectSprites(preset, makeCast(), elapsed, options).map((sprite) => sprite.key);

    // The first half is the light at the scabbard alone; the cut is instant and splits no ground.
    expect(keysAt(300).some((key) => key.includes('-iai-glint'))).toBe(true);
    expect(keysAt(300).some((key) => key.includes('-flare-'))).toBe(false);
    expect(keysAt(580).some((key) => key.includes('-flare-'))).toBe(true);
    expect(keysAt(900).some((key) => key.includes('-cut'))).toBe(true);
    expect(keysAt(900).some((key) => key.includes('-slash-crack'))).toBe(false);
  });

  it('splits the ground in one line with a cleave', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'heavy';
    const keys = effectSprites(preset, makeCast(), 900, options).map((sprite) => sprite.key);

    expect(keys.some((key) => key.includes('-slash-split'))).toBe(true);
    expect(keys.some((key) => key.includes('-slash-crack'))).toBe(false);
  });

  it('makes the moment of a blow with a star and speed lines', () => {
    const preset = makePreset('bash');
    const keysAt = (elapsed: number) => effectSprites(preset, makeCast(), elapsed, options).map((s) => s.key);

    // The flash, the star and the lines all arrive together.
    expect(keysAt(60).some((key) => key.includes('-bash-flash'))).toBe(true);
    expect(keysAt(200).some((key) => key.includes('-bash-star'))).toBe(true);
    expect(keysAt(200).some((key) => key.includes('-bash-lines'))).toBe(true);
    // The star does not linger; only the ring spreads and ends.
    expect(keysAt(700).some((key) => key.includes('-bash-star'))).toBe(false);
    expect(keysAt(700).some((key) => key.includes('-bash-shock'))).toBe(true);
  });

  it('gathers before a heavy stroke and leaves the cut behind', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'wide';
    const at = (elapsed: number) => effectSprites(preset, makeCast(), elapsed, options).map((sprite) => sprite.key);

    // The gathering, the stroke and what lingers.
    expect(at(150).some((key) => key.includes('-charge'))).toBe(true);
    expect(at(150).some((key) => key.includes('-cut'))).toBe(false);
    expect(at(900).some((key) => key.includes('-cut'))).toBe(true);
    expect(at(900).some((key) => key.includes('-slash-shock'))).toBe(true);
    expect(at(900).some((key) => key.includes('-slash-crack'))).toBe(true);
  });

  it('spaces the strokes of a combination out', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'combo';
    const blades = effectSprites(preset, makeCast(), 300, options).filter((sprite) => sprite.key.includes('-blade-'));
    const delays = blades.map((blade) => Number(blade.animation.match(/([\d.]+)ms both/)?.[1] ?? -1));

    // Together they read as a single cut.
    expect(new Set(delays).size).toBe(delays.length);
    for (let index = 1; index < delays.length; index++) expect(delays[index]).toBeGreaterThan(delays[index - 1]);
  });

  it('changes the angle and the place of each', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'combo';
    const blades = effectSprites(preset, makeCast(), 300, options).filter((sprite) => sprite.key.includes('-blade-'));

    expect(new Set(blades.map((blade) => blade.rotate)).size).toBe(blades.length);
    expect(new Set(blades.map((blade) => blade.offsetX)).size).toBeGreaterThan(1);
  });

  it('faces a cut at the camera', () => {
    const sprites = effectSprites(makePreset('slash'), makeCast(), 200, options);

    expect(sprites.every((sprite) => !sprite.flat)).toBe(true);
  });

  it('grows the sprites with the scale', () => {
    const normal = effectSprites(makePreset('burst'), makeCast(), 300, options);
    const large = effectSprites(makePreset('burst', { scale: 2 }), makeCast(), 300, options);

    expect(large[0].width).toBeCloseTo(normal[0].width * 2);
  });
});

describe('effectLandingTimes()', () => {
  it('finds where the blow lands for an effect that sounds nothing there', () => {
    const preset = new EffectPreset('preset');
    preset.kind = 'projectile';
    preset.durationMs = 1000;
    preset.impactSoundIdentifier = '';

    expect(impactSoundTimes(preset)).toEqual([]);
    expect(effectLandingTimes(preset)).toEqual([340]);
  });

  it('lands an effect about the target partway through it', () => {
    const preset = new EffectPreset('preset');
    preset.kind = 'slash';
    preset.durationMs = 1000;

    expect(effectLandingTimes(preset)).toEqual([500]);
  });
});

describe('impactSoundTimes()', () => {
  function makePreset(kind: EffectKind, duration: number): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.durationMs = duration;
    preset.impactSoundIdentifier = 'se-impact';
    return preset;
  }

  it('sounds nothing when there is no landing sound', () => {
    const preset = makePreset('projectile', 1000);
    preset.impactSoundIdentifier = '';

    expect(impactSoundTimes(preset)).toEqual([]);
  });

  it('sounds a single shot once, as it lands', () => {
    expect(impactSoundTimes(makePreset('projectile', 1000))).toEqual([340]);
  });

  it('sets the speed of a shot by real time rather than by the length of the effect', () => {
    const quick = makePreset('projectile', 800);
    const long = makePreset('projectile', 4000);

    // Five times the length leaves the time to the landing unchanged.
    expect(impactSoundTimes(quick)[0]).toBe(impactSoundTimes(long)[0]);
  });

  it('fires a burst through at the interval it is given', () => {
    const preset = makePreset('projectile', 3000);
    preset.projectileStyle = 'bullet';
    preset.shots = 10;
    preset.shotInterval = 90;
    const times = impactSoundTimes(preset);

    // Ten shots at that interval finish inside a second, however long the effect runs.
    expect(times).toHaveLength(10);
    expect(times[1] - times[0]).toBe(90);
    expect(times[times.length - 1]).toBeLessThan(1100);
  });

  it('closes the interval up when it will not fit', () => {
    const preset = makePreset('projectile', 600);
    preset.projectileStyle = 'bullet';
    preset.shots = 10;
    preset.shotInterval = 400;
    const times = impactSoundTimes(preset);

    // As given it would run past the end, so it is closed up until it fits.
    expect(times[times.length - 1]).toBeLessThanOrEqual(600);
  });

  it('flies a bullet faster than a magical bolt', () => {
    const bolt = makePreset('projectile', 1000);
    const bullet = makePreset('projectile', 1000);
    bullet.projectileStyle = 'bullet';

    expect(impactSoundTimes(bullet)[0]).toBeLessThan(impactSoundTimes(bolt)[0]);
  });

  it('sounds each shot of a burst', () => {
    const preset = makePreset('projectile', 2000);
    preset.shots = 5;

    // One landing for a hail of shots is not enough sound.
    expect(impactSoundTimes(preset)).toHaveLength(5);
  });

  it('thins them where they come too close together', () => {
    const preset = makePreset('projectile', 600);
    preset.shots = 20;
    const times = impactSoundTimes(preset);

    // A shortest interval is kept, so the same sound does not pile up and cancel itself.
    for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(70);
    }
    expect(times.length).toBeLessThan(20);
  });

  it('sounds anything that does not fly once', () => {
    expect(impactSoundTimes(makePreset('bash', 1000))).toHaveLength(1);
  });
});

describe('the sounds of a run built of stages', () => {
  function makeRun(stages: unknown[]): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = 'burst';
    preset.soundIdentifier = 'se-shot';
    preset.impactSoundIdentifier = 'se-impact';
    preset.stages = JSON.stringify(stages);
    return preset;
  }

  it('sounds a shot as each stage that travels starts', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
      { role: 'travel', kind: 'projectile', durationMs: 500 },
    ]);

    expect(launchSoundTimes(preset)).toEqual([0, 1000]);
  });

  it('sounds a landing as each stage that lands starts', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
    ]);

    expect(impactSoundTimes(preset)).toEqual([600]);
  });

  it('sounds the branches of a spawn once rather than one apiece', () => {
    // They all start together, and one sound each would be a single noise.
    const preset = makeRun([
      {
        role: 'spawn',
        kind: 'burst',
        durationMs: 100,
        branches: 4,
        children: [{ role: 'impact', kind: 'frost', durationMs: 300 }],
      },
    ]);

    expect(impactSoundTimes(preset)).toEqual([0]);
  });

  it('sounds the shot at the start for a run that travels nowhere', () => {
    const preset = makeRun([{ role: 'impact', kind: 'burst', durationMs: 400 }]);

    expect(launchSoundTimes(preset)).toEqual([0]);
  });

  it('sounds the landing where the travelling stops for a run that lands nowhere', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'travel', kind: 'projectile', durationMs: 300 },
    ]);

    expect(impactSoundTimes(preset)).toEqual([900]);
  });

  it('sounds the landing as it opens for a run that only leaves something behind', () => {
    const preset = makeRun([{ role: 'field', kind: 'flame', durationMs: 2000 }]);

    expect(impactSoundTimes(preset)).toEqual([0]);
  });
});

describe('isEffectFinished()', () => {
  it('counts it finished only once every target has played through', () => {
    const preset = new EffectPreset('preset');
    preset.durationMs = 500;
    preset.staggerMs = 200;
    const cast: EffectCast = {
      presetIdentifier: 'preset',
      casterIdentifier: '',
      origin: null,
      seed: 0,
      targets: [
        { identifier: 'a', x: 0, y: 0, z: 0 },
        { identifier: 'b', x: 0, y: 0, z: 0 },
      ],
    };

    expect(isEffectFinished(preset, cast, 600)).toBe(false);
    expect(isEffectFinished(preset, cast, 700)).toBe(true);
  });
});

describe('seededRandom()', () => {
  it('returns the same sequence from the same seed', () => {
    const first = seededRandom(99);
    const second = seededRandom(99);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it('returns something at or above nothing and below one', () => {
    const random = seededRandom(0);

    for (let count = 0; count < 50; count++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('launchSoundTimes()', () => {
  function preset(overrides: Partial<Record<string, unknown>> = {}): EffectPreset {
    const made = new EffectPreset('launch-sound-test');
    Object.assign(made, {
      kind: 'projectile',
      projectileStyle: 'blaster',
      durationMs: 1200,
      soundIdentifier: 'shot',
      impactSoundIdentifier: 'hit',
      shots: 1,
      shotInterval: 0,
      ...overrides,
    });
    return made;
  }

  it('sounds each shot', () => {
    const times = launchSoundTimes(preset({ shots: 6, shotInterval: 110 }));

    expect(times).toHaveLength(6);
    expect(times[0]).toBe(0);
    expect(times.every((at, index) => index === 0 || at > times[index - 1])).toBe(true);
  });

  it('sounds a single shot once', () => {
    expect(launchSoundTimes(preset())).toEqual([0]);
  });

  it('thins the shots where they come too close together', () => {
    const times = launchSoundTimes(preset({ shots: 40, shotInterval: 1, durationMs: 300 }));
    expect(times.length).toBeLessThan(40);
  });

  it('sounds anything that does not fly once, as it starts', () => {
    expect(launchSoundTimes(preset({ kind: 'raybeam' }))).toEqual([0]);
  });

  it('returns nothing when there is no sound to make', () => {
    expect(launchSoundTimes(preset({ soundIdentifier: '' }))).toEqual([]);
  });
});

describe('the tail of a shot that flies straight', () => {
  function shotSprites(style: string, elapsedMs: number) {
    const preset = new EffectPreset('trail-test');
    Object.assign(preset, {
      kind: 'projectile',
      projectileStyle: style,
      durationMs: 1000,
      shots: 1,
      shotInterval: 0,
      colorPrimary: '#ffffff',
      colorSecondary: '#ff0000',
    });
    const cast: EffectCast = {
      presetIdentifier: 'trail-test',
      casterIdentifier: '',
      origin: { x: -300, y: 0, z: 0 },
      seed: 3,
      targets: [{ identifier: 'char0', x: 300, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 });
  }

  it('gives a bullet, a beam and a tracer one tail each', () => {
    for (const style of ['bullet', 'blaster', 'tracer']) {
      const keys = shotSprites(style, 60).map((sprite) => sprite.key);
      expect(keys.filter((key) => key.includes('-ribbon-'))).toHaveLength(0);
      expect(keys.filter((key) => key.includes('-trail')).length).toBeLessThanOrEqual(1);
    }
  });

  it('gives a flying cut one too', () => {
    const keys = shotSprites('crescent', 60).map((sprite) => sprite.key);
    expect(keys.filter((key) => key.includes('-ribbon-'))).toHaveLength(0);
  });

  /** How far above the straight line from the shot to the target it rises. */
  function riseAboveLine(style: string, elapsedMs: number): number {
    const shot = shotSprites(style, elapsedMs).find((sprite) => sprite.key.includes('-shot'));
    if (!shot) return Number.NaN;
    const along = (shot.x - -300) / 600;
    return shot.z - 30 * along;
  }

  it('flies a blade and anything of light straight', () => {
    for (const style of ['crescent', 'blaster', 'tracer']) {
      expect(riseAboveLine(style, 40)).toBeCloseTo(0, 6);
    }
  });

  it('arcs an arrow', () => {
    expect(riseAboveLine('arrow', 130)).toBeGreaterThan(1);
  });

  it('strings a magical bolt out of particles as before', () => {
    const keys = shotSprites('bolt', 160).map((sprite) => sprite.key);
    expect(keys.filter((key) => key.includes('-ribbon-')).length).toBeGreaterThan(1);
  });
});

describe('a great sword of light', () => {
  function bladeSprites(elapsedMs: number) {
    const preset = new EffectPreset('excalibur-test');
    Object.assign(preset, { kind: 'skyblade', durationMs: 3000, colorPrimary: '#fff', colorSecondary: '#fa0' });
    const cast: EffectCast = {
      presetIdentifier: 'excalibur-test',
      casterIdentifier: 'caster',
      origin: { x: -400, y: 0, z: 0 },
      seed: 5,
      targets: [{ identifier: 'char0', x: 400, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 });
  }

  function blade(elapsedMs: number) {
    return bladeSprites(elapsedMs).find((sprite) => sprite.key.endsWith('-excalibur-blade-2'));
  }

  it('raises the light from the feet first', () => {
    const rising = bladeSprites(300).filter((sprite) => sprite.key.includes('-excalibur-rise-'));

    expect(rising.length).toBeGreaterThan(1);
    expect(rising.every((sprite) => sprite.x === -400)).toBe(true);
    expect(rising.some((sprite) => sprite.offsetY < 0)).toBe(true);
  });

  it('brings it down only once the blade has reached its full length', () => {
    const forming = blade(900)!;
    const formed = blade(1450)!;

    expect(formed.height).toBeGreaterThan(forming.height);
    expect(formed.rotate).toBeCloseTo(0, 5);
  });

  it('keeps the foot of the blade at the casters feet through the stroke', () => {
    const rootOf = (sprite: { offsetX: number; offsetY: number; height: number; rotate: number }) => {
      const radians = (sprite.rotate * Math.PI) / 180;
      return {
        x: sprite.offsetX - (sprite.height / 2) * Math.sin(radians),
        y: sprite.offsetY + (sprite.height / 2) * Math.cos(radians),
      };
    };

    const standing = rootOf(blade(1450)!);
    const swung = rootOf(blade(2000)!);

    expect(swung.x).toBeCloseTo(standing.x, 5);
    expect(swung.y).toBeCloseTo(standing.y, 5);
  });

  it('lights the target once the stroke is through', () => {
    const flash = bladeSprites(2400).find((sprite) => sprite.key.includes('-excalibur-burst'));

    expect(flash).toBeDefined();
    expect(flash!.x).toBe(400);
  });

  it('bursts nothing while it is still rising', () => {
    expect(bladeSprites(300).filter((sprite) => sprite.key.includes('-excalibur-burst'))).toHaveLength(0);
  });
});

describe('swingTiltOf()', () => {
  it('never passes under the board, whichever way it faces', () => {
    for (let heading = -360; heading <= 360; heading += 5) {
      expect(Math.abs(swingTiltOf(heading))).toBeLessThanOrEqual(100);
    }
  });

  it('never points straight down, even with the caster above the target', () => {
    expect(Math.abs(swingTiltOf(90))).toBeLessThan(180);
    expect(Math.abs(swingTiltOf(95))).toBeLessThan(180);
    expect(Math.abs(swingTiltOf(-95))).toBeLessThan(180);
  });

  it('swings to the horizontal for a target alongside', () => {
    expect(swingTiltOf(0)).toBeCloseTo(90, 5);
    expect(swingTiltOf(180)).toBeCloseTo(-90, 5);
  });

  it('turns the shorter way', () => {
    expect(swingTiltOf(-90)).toBeCloseTo(0, 5);
  });
});

describe('a missile', () => {
  function missileSprites(style: string, elapsedMs: number) {
    const preset = new EffectPreset('missile-test');
    Object.assign(preset, {
      kind: 'projectile',
      projectileStyle: style,
      durationMs: 2000,
      shots: 4,
      shotInterval: 130,
      colorPrimary: '#ffffff',
      colorSecondary: '#ff6a2b',
    });
    const cast: EffectCast = {
      presetIdentifier: 'missile-test',
      casterIdentifier: '',
      origin: { x: -300, y: 0, z: 0 },
      seed: 11,
      targets: [{ identifier: 'char0', x: 300, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 });
  }

  /** How far to the side of the straight line from the shot to the target it strays. */
  function sideOffset(style: string, elapsedMs: number, shot: number): number {
    const head = missileSprites(style, elapsedMs).find((sprite) => sprite.key === `0-s${shot}-shot`);
    return head ? head.y : Number.NaN;
  }

  it('swells each missile to a different side before it closes', () => {
    const first = sideOffset('missile', 300, 0);
    const second = sideOffset('missile', 300, 1);

    expect(Math.abs(first)).toBeGreaterThan(1);
    expect(Math.sign(first)).not.toBe(Math.sign(second));
  });

  it('swings a guided one wider than a small missile', () => {
    const missile = Math.abs(sideOffset('missile', 300, 0));
    const cruise = Math.abs(sideOffset('cruise', 300, 0));

    expect(cruise).toBeGreaterThan(missile);
  });

  it('comes back to the target by the time it lands', () => {
    const middle = Math.abs(sideOffset('cruise', 600, 0));
    const arriving = Math.abs(sideOffset('cruise', 1170, 0));

    expect(arriving).toBeLessThan(middle * 0.2);
  });

  it('trails an exhaust behind it', () => {
    const thrust = missileSprites('missile', 300).find((sprite) => sprite.key === '0-s0-thrust');
    const head = missileSprites('missile', 300).find((sprite) => sprite.key === '0-s0-shot');

    expect(thrust).toBeDefined();
    expect(thrust!.x).toBeLessThan(head!.x);
  });

  it('keeps that exhaust with the missile', () => {
    const gapAt = (elapsedMs: number) => {
      const sprites = missileSprites('missile', elapsedMs);
      const head = sprites.find((sprite) => sprite.key === '0-s0-shot')!;
      const thrust = sprites.find((sprite) => sprite.key === '0-s0-thrust')!;
      return Math.hypot(head.x - thrust.x, head.y - thrust.y, head.z - thrust.z);
    };

    // It sits one length behind; parted differently at different speeds it would look left behind.
    expect(gapAt(300)).toBeCloseTo(gapAt(200), 5);
  });

  it('runs the smoke along the path', () => {
    const sprites = missileSprites('cruise', 800);
    const head = sprites.find((sprite) => sprite.key === '0-s0-shot')!;
    const smoke = sprites.filter((sprite) => sprite.key.startsWith('0-s0-smoke-'));

    // Drawn as one chord, the missile and its tail part company through the turn.
    expect(smoke.length).toBeGreaterThan(3);
    expect(sprites.filter((sprite) => sprite.key.includes('-trail'))).toHaveLength(0);
    expect(Math.abs(smoke[0].rotate - head.rotate)).toBeLessThan(6);
  });
});

describe('a rain of arrows', () => {
  function rainSprites(elapsedMs: number) {
    const preset = new EffectPreset('rain-test');
    Object.assign(preset, {
      kind: 'arrowrain',
      durationMs: 2400,
      colorPrimary: '#ffffff',
      colorSecondary: '#8a6a3c',
    });
    const cast: EffectCast = {
      presetIdentifier: 'rain-test',
      casterIdentifier: 'caster',
      origin: { x: -400, y: 0, z: 0 },
      seed: 7,
      targets: [{ identifier: 'char0', x: 0, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 });
  }

  function keysAt(elapsedMs: number, part: string) {
    return rainSprites(elapsedMs).filter((sprite) => sprite.key.includes(part));
  }

  it('has the archer loose upwards first', () => {
    const loosed = keysAt(60, '-rain-loose-');

    expect(loosed.length).toBeGreaterThan(0);
    // They rise from the caster; appearing over the target they would come from nowhere.
    expect(loosed.every((sprite) => sprite.x < -200)).toBe(true);
    expect(loosed.every((sprite) => sprite.z > 0)).toBe(true);
    expect(keysAt(60, '-rain-arrow-')).toHaveLength(0);
  });

  it('carries them up', () => {
    const heightAt = (elapsedMs: number) => rainSprites(elapsedMs).find((sprite) => sprite.key === '0-rain-loose-0')!.z;

    expect(heightAt(200)).toBeGreaterThan(heightAt(60));
  });

  it('marks the ground before they come down', () => {
    expect(keysAt(300, '-rain-mark-').length).toBeGreaterThan(0);
    expect(keysAt(300, '-rain-arrow-')).toHaveLength(0);
  });

  it('brings them down from above', () => {
    const early = keysAt(700, '-rain-arrow-');
    const late = keysAt(800, '-rain-arrow-');

    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    expect(Math.min(...late.map((sprite) => sprite.z))).toBeLessThan(Math.max(...early.map((sprite) => sprite.z)));
  });

  it('scatters them about the centre as they strike', () => {
    const stuck = keysAt(2300, '-rain-stuck-');

    expect(stuck.length).toBeGreaterThan(8);
    expect(new Set(stuck.map((sprite) => `${sprite.x},${sprite.y}`)).size).toBe(stuck.length);
    expect(stuck.every((sprite) => Math.hypot(sprite.x, sprite.y) <= 50 * 2.3)).toBe(true);
  });

  it('drops them in the same places from frame to frame', () => {
    const once = keysAt(900, '-rain-mark-').map((sprite) => `${sprite.x},${sprite.y}`);
    const twice = keysAt(900, '-rain-mark-').map((sprite) => `${sprite.x},${sprite.y}`);

    expect(once).toEqual(twice);
  });

  it('sounds the loosing and the striking many times', () => {
    const preset = new EffectPreset('rain-sound-test');
    Object.assign(preset, { kind: 'arrowrain', durationMs: 2400 });
    preset.soundIdentifier = 'se-bow';
    preset.impactSoundIdentifier = 'se-pierce';

    const looses = launchSoundTimes(preset);
    const hits = impactSoundTimes(preset);

    // Sounded once, the ear cannot tell how many fell.
    expect(looses.length).toBeGreaterThan(2);
    expect(hits.length).toBeGreaterThan(2);
    expect([...looses].sort((left, right) => left - right)).toEqual(looses);
    expect(Math.min(...hits)).toBeGreaterThan(Math.min(...looses));
    // Too close together they run into one sound and the arrows are lost.
    expect(Math.min(...hits.slice(1).map((at, index) => at - hits[index]))).toBeGreaterThanOrEqual(110);
  });
});

describe('a great sword of an element', () => {
  function bladeImpact(impactKind: string, elapsedMs: number) {
    const preset = new EffectPreset('blade-element-test');
    Object.assign(preset, {
      kind: 'skyblade',
      impactKind,
      durationMs: 3000,
      colorPrimary: '#ffffff',
      colorSecondary: '#ff4a12',
    });
    const cast: EffectCast = {
      presetIdentifier: 'blade-element-test',
      casterIdentifier: 'caster',
      origin: { x: -400, y: 0, z: 0 },
      seed: 5,
      targets: [{ identifier: 'char0', x: 400, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 }).filter((sprite) =>
      sprite.key.includes('-excalibur-impact')
    );
  }

  it('ends it in whatever element it is given', () => {
    expect(bladeImpact('frost', 2500).length).toBeGreaterThan(0);
  });

  it('ends one of light as light', () => {
    expect(bladeImpact('', 2500)).toHaveLength(0);
  });

  it('shows none of that element before the stroke falls', () => {
    expect(bladeImpact('flame', 300)).toHaveLength(0);
  });
});

describe('the height of a guided missile', () => {
  function cruiseHeight(elapsedMs: number): number {
    const preset = new EffectPreset('cruise-height-test');
    Object.assign(preset, {
      kind: 'projectile',
      projectileStyle: 'cruise',
      durationMs: 2600,
      colorPrimary: '#ffffff',
      colorSecondary: '#ff5a1f',
    });
    const cast: EffectCast = {
      presetIdentifier: 'cruise-height-test',
      casterIdentifier: '',
      origin: { x: -600, y: 0, z: 0 },
      seed: 3,
      targets: [{ identifier: 'char0', x: 600, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 }).find((sprite) => sprite.key === '0-s0-shot')!.z;
  }

  it('climbs to its cruising height at once and holds it', () => {
    // Thrown in an arc it reads as a mortar; it climbs and then flies level.
    expect(cruiseHeight(300)).toBeGreaterThan(cruiseHeight(60));
    expect(Math.abs(cruiseHeight(700) - cruiseHeight(400))).toBeLessThan(cruiseHeight(400) * 0.35);
  });

  it('dives onto the target at the end', () => {
    expect(cruiseHeight(1350)).toBeLessThan(cruiseHeight(700));
  });

  it('drops it all at once once it begins', () => {
    const top = cruiseHeight(700);
    const late = cruiseHeight(1330);

    // Let down gently it reads as a landing; most of the height goes in the last breath.
    expect(top - late).toBeLessThan(top * 0.25);
    expect(late - cruiseHeight(1395)).toBeGreaterThan((top - late) * 2);
  });
});

describe('a ballistic missile', () => {
  function ballisticSprites(elapsedMs: number) {
    const preset = new EffectPreset('ballistic-test');
    Object.assign(preset, {
      kind: 'ballistic',
      impactKind: 'mushroom',
      durationMs: 4200,
      colorPrimary: '#ffe0a0',
      colorSecondary: '#ff4a12',
    });
    const cast: EffectCast = {
      presetIdentifier: 'ballistic-test',
      casterIdentifier: 'caster',
      origin: { x: -500, y: 0, z: 0 },
      seed: 4,
      targets: [{ identifier: 'char0', x: 500, y: 0, z: 0 }],
    };
    return effectSprites(preset, cast, elapsedMs, { baseSize: 50 });
  }

  function partAt(elapsedMs: number, part: string) {
    return ballisticSprites(elapsedMs).filter((sprite) => sprite.key.includes(part));
  }

  it('launches it straight up from the casters feet', () => {
    const low = partAt(200, '-ballistic-lift')[0];
    const high = partAt(1000, '-ballistic-lift')[0];

    expect(low.x).toBe(-500);
    expect(high.x).toBe(-500);
    expect(high.z).toBeGreaterThan(low.z);
  });

  it('strikes nothing between the launch and the fall', () => {
    expect(partAt(1400, '-ballistic-shot')).toHaveLength(0);
    expect(partAt(1400, '-ballistic-impact')).toHaveLength(0);
    // Where it will fall is shown first; with the shot out of sight, without it the explosion comes from nowhere.
    expect(partAt(1400, '-ballistic-mark-').length).toBeGreaterThan(0);
  });

  it('brings it down directly over the target', () => {
    const early = partAt(2700, '-ballistic-shot')[0];
    const late = partAt(3400, '-ballistic-shot')[0];

    expect(early.z).toBeGreaterThan(late.z);
    expect(Math.abs(late.x - 500)).toBeLessThan(Math.abs(early.x - 500));
  });

  it('bursts at the target only once it has come all the way down', () => {
    const burst = partAt(4000, '-ballistic-impact');

    expect(burst.length).toBeGreaterThan(0);
    expect(burst.every((sprite) => sprite.x === 500)).toBe(true);
    expect(partAt(4000, '-ballistic-shot')).toHaveLength(0);
  });

  it('sounds the landing at that moment', () => {
    const preset = new EffectPreset('ballistic-sound-test');
    Object.assign(preset, { kind: 'ballistic', durationMs: 4200 });
    preset.impactSoundIdentifier = 'se-boom';

    expect(preset.impactSoundAt).toBe(BALLISTIC_DIVE_END);
    expect(impactSoundTimes(preset)).toEqual([Math.round(4200 * BALLISTIC_DIVE_END)]);
  });
});

describe('which effect goes where', () => {
  it('puts no kind in both tables', () => {
    const both = AIMED_EFFECT_KINDS.filter((kind) => CENTERED_EFFECT_KINDS.includes(kind));

    expect(both).toEqual([]);
  });

  it('puts every kind but the burst in one of them', () => {
    // Anything in neither falls back to bursting, and the burst is the only one that should.
    const unrouted = EFFECT_KINDS.filter(
      (kind) => !AIMED_EFFECT_KINDS.includes(kind) && !CENTERED_EFFECT_KINDS.includes(kind)
    );

    expect(unrouted).toEqual(['burst']);
  });
});
