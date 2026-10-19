/**
 * Short sounds made on the spot with the Web Audio API rather than played from a file: a few
 * voices, each a tone and its partials or a band of noise, through a gentle low-pass, an optional
 * reverb and a limiter.
 */

/** One partial of a tone: its frequency as a multiple of the voice's, its gain, and its decay. */
export type ChimePartial = readonly [ratio: number, gain: number, decay: number];

/** One voice of a chime, starting `t` seconds in. */
export interface ChimeVoice {
  /** When the voice starts, in seconds from the start of the chime. */
  readonly t: number;
  /** The frequency in Hz: the tone's, or the middle of the band of noise. */
  readonly f: number;
  /** A frequency the tone glides down or up from, over `s` seconds. */
  readonly f0?: number;
  /** How long the glide from `f0` takes, in seconds. */
  readonly s?: number;
  /** The peak gain. */
  readonly g: number;
  /** How long it takes to die away, in seconds. */
  readonly d: number;
  /** How long it takes to rise, in seconds. */
  readonly a?: number;
  /** The waveform of a tone. */
  readonly w?: OscillatorType;
  /** The partials of a tone; one plain partial when none are given. */
  readonly p?: readonly ChimePartial[];
  /** Noise instead of a tone. */
  readonly type?: 'noise';
  /** How narrow the band of noise is. */
  readonly q?: number;
}

/** A chime: its voices and how it is mixed. */
export interface ChimePreset {
  readonly id: string;
  readonly name: string;
  readonly reverb?: number;
  readonly brightness?: number;
  readonly gain?: number;
  readonly voices: readonly ChimeVoice[];
}

/** How a chime is played: shifted in pitch, stretched, or with its mix changed. */
export interface ChimeOptions {
  readonly pitch?: number;
  readonly length?: number;
  readonly reverb?: number | null;
  readonly brightness?: number | null;
  readonly volume?: number;
}

/** The chime that tells the owner of a piece its turn has begun. */
export const TURN_SE_SIGNAL: ChimePreset = {
  id: 'signal',
  name: 'シグナル',
  reverb: 0.15,
  brightness: 9000,
  gain: 0.9,
  voices: [
    {
      t: 0,
      f: 880,
      g: 0.45,
      d: 0.32,
      p: [
        [1, 1, 1],
        [2, 0.22, 0.55],
        [3.01, 0.06, 0.3],
      ],
    },
    {
      t: 0.085,
      f: 1318.5,
      g: 0.55,
      d: 0.5,
      p: [
        [1, 1, 1],
        [2, 0.18, 0.5],
        [3.01, 0.05, 0.3],
      ],
    },
  ],
};

/** The quieter chime that tells everyone else a turn has begun. */
export const TURN_SE_TICK: ChimePreset = {
  id: 'tick',
  name: 'ティック',
  reverb: 0.05,
  brightness: 9000,
  gain: 0.9,
  voices: [
    {
      t: 0,
      f: 1318.5,
      g: 0.18,
      d: 0.09,
      p: [
        [1, 1, 1],
        [2, 0.15, 0.5],
      ],
    },
  ],
};

/**
 * Plays a chime now into `destination`, resuming the context first when the browser holds it
 * suspended, and answers how many seconds it lasts.
 */
export function playChime(
  context: BaseAudioContext,
  preset: ChimePreset,
  destination: AudioNode = context.destination,
  volume: number = 0.8
): number {
  if (context.state === 'suspended' && 'resume' in context) void (context as AudioContext).resume();
  return scheduleChime(context, destination, context.currentTime + 0.01, preset, { volume });
}

/**
 * Schedules a chime to start at `t0` on the context's clock, into `destination`, and answers how
 * many seconds it lasts from then, its reverb tail included.
 */
export function scheduleChime(
  context: BaseAudioContext,
  destination: AudioNode,
  t0: number,
  preset: ChimePreset,
  options?: ChimeOptions
): number {
  const opt = { pitch: 0, length: 1, reverb: null, brightness: null, volume: 1, ...options };
  const pitchRatio = Math.pow(2, opt.pitch / 12);
  const length = opt.length;
  const reverb = opt.reverb != null ? opt.reverb : preset.reverb || 0;
  const brightness = opt.brightness != null ? opt.brightness : preset.brightness || 12000;

  const bus = context.createBiquadFilter();
  bus.type = 'lowpass';
  bus.frequency.value = brightness;
  bus.Q.value = 0.5;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  const out = context.createGain();
  out.gain.value = opt.volume * (preset.gain || 1);
  bus.connect(limiter);
  if (reverb > 0) {
    const irLength = Math.floor(context.sampleRate * 1.4);
    const ir = context.createBuffer(2, irLength, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      for (let i = 0; i < irLength; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 3.2);
    }
    const convolver = context.createConvolver();
    convolver.buffer = ir;
    const wet = context.createGain();
    wet.gain.value = reverb * 0.5;
    bus.connect(convolver);
    convolver.connect(wet);
    wet.connect(limiter);
  }
  limiter.connect(out);
  out.connect(destination);

  let noise: AudioBuffer | null = null;
  const envelope = (t: number, peak: number, decay: number, attack: number): GainNode => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  };
  let end = 0;
  for (const voice of preset.voices) {
    const t = t0 + voice.t;
    const attack = voice.a || 0.004;
    const decay = voice.d * length;
    if (voice.type === 'noise') {
      if (!noise) {
        noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let j = 0; j < data.length; j++) data[j] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource();
      source.buffer = noise;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = voice.f * pitchRatio;
      band.Q.value = voice.q || 5;
      const gain = envelope(t, voice.g, decay, attack);
      source.connect(band);
      band.connect(gain);
      gain.connect(bus);
      source.start(t);
      source.stop(t + attack + decay + 0.05);
      end = Math.max(end, voice.t + attack + decay + 0.05);
      continue;
    }
    for (const partial of voice.p || [[1, 1, 1] as const]) {
      const oscillator = context.createOscillator();
      oscillator.type = voice.w || 'sine';
      const frequency = voice.f * partial[0] * pitchRatio;
      if (voice.f0) {
        oscillator.frequency.setValueAtTime(voice.f0 * partial[0] * pitchRatio, t);
        oscillator.frequency.exponentialRampToValueAtTime(frequency, t + (voice.s || 0.04));
      } else {
        oscillator.frequency.setValueAtTime(frequency, t);
      }
      const partialDecay = decay * partial[2];
      const gain = envelope(t, voice.g * partial[1], partialDecay, attack);
      oscillator.connect(gain);
      gain.connect(bus);
      oscillator.start(t);
      oscillator.stop(t + attack + partialDecay + 0.05);
      end = Math.max(end, voice.t + attack + partialDecay + 0.05);
    }
  }
  return end + (reverb > 0 ? 1.4 : 0);
}
