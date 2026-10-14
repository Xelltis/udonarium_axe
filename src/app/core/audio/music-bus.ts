import { SidechainDucker } from '@axe/core/audio/sidechain-ducker';
import { Logger } from '@axe/core/logging/logger';
import { AudioPlayer, type ChannelInsert, VolumeType } from '@axe/core/storage/audio-player';

/** The effects the music goes through. */
export interface MusicEffects {
  /** The filter, from -1 for a muffle through 0 for nothing to 1 for a thin line. */
  readonly filter: number;
  /** How much echoes back, from 0 to 1. */
  readonly echo: number;
  /** How long the echo waits before coming back, in seconds. */
  readonly echoDelayS: number;
  /** How much rings on as in a hall, from 0 to 1. */
  readonly reverb: number;
}

export const NO_MUSIC_EFFECTS: MusicEffects = { filter: 0, echo: 0, echoDelayS: 0.375, reverb: 0 };

/** The corners of the two filters for one turn of the filter knob, and how sharply they cut. */
export interface FilterSetting {
  readonly lowpassHz: number;
  readonly highpassHz: number;
  readonly q: number;
}

const OPEN_LOWPASS_HZ = 20000;
const OPEN_HIGHPASS_HZ = 10;
const CLOSED_LOWPASS_HZ = 150;
const LOWEST_SWEPT_HIGHPASS_HZ = 20;
const CLOSED_HIGHPASS_HZ = 6000;
const FLAT_Q = 0.707;
const SWEPT_Q_RISE = 0.8;

/**
 * Where the filters stand for one turn of the filter knob: in the middle both are wide open; turned
 * left the treble is cut lower and lower down to 150 Hz, and turned right the bass is cut higher and
 * higher up to 6 kHz, each sweep spread evenly over the octaves and growing a little sharper as it
 * goes, as a DJ mixer's filter does.
 */
export function filterSetting(filter: number): FilterSetting {
  const amount = Math.min(1, Math.abs(filter));
  if (filter < 0) {
    return {
      lowpassHz: OPEN_LOWPASS_HZ * Math.pow(CLOSED_LOWPASS_HZ / OPEN_LOWPASS_HZ, amount),
      highpassHz: OPEN_HIGHPASS_HZ,
      q: FLAT_Q + SWEPT_Q_RISE * amount,
    };
  }
  if (filter > 0) {
    return {
      lowpassHz: OPEN_LOWPASS_HZ,
      highpassHz: LOWEST_SWEPT_HIGHPASS_HZ * Math.pow(CLOSED_HIGHPASS_HZ / LOWEST_SWEPT_HIGHPASS_HZ, amount),
      q: FLAT_Q + SWEPT_Q_RISE * amount,
    };
  }
  return { lowpassHz: OPEN_LOWPASS_HZ, highpassHz: OPEN_HIGHPASS_HZ, q: FLAT_Q };
}

/** How long the echo and the reverb keep sounding once turned down, before they are taken off the music to save work. */
const ECHO_TAIL_MS = 6000;
const REVERB_TAIL_MS = 4000;
const REVERB_LENGTH_S = 2.8;
const ECHO_BASE_FEEDBACK = 0.3;
const ECHO_FEEDBACK_RISE = 0.3;
const ECHO_TONE_HZ = 3500;

/**
 * The way the room's music goes between its players and its volume, set into the music channel:
 * the DJ's filter, echo and reverb, the ducking under sound effects and cut-ins, and a tap that
 * meters read it from.
 *
 * The echo and the reverb are put on the music only while turned up, and taken off a few seconds
 * after they are turned down, once what they hold has died away, so they cost nothing unused.
 *
 * There is one for the page, built on the audio context. Where the page cannot build it, as with
 * an audio context too old to have what it needs, the music goes straight to its volume as before.
 */
export class MusicBus implements ChannelInsert {
  private static _instance: MusicBus | null = null;
  private static watching = false;
  private static duckingWanted = false;
  private static effectsWanted: MusicEffects = NO_MUSIC_EFFECTS;

  /** Where the players' music goes in. */
  readonly input: GainNode;
  /** Where the music comes out to its volume. */
  readonly output: GainNode;
  /** A tap after everything, for meters and pictures of the music; it leads nowhere audible. */
  readonly analyser: AnalyserNode;
  private readonly highpass: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly sum: GainNode;
  private readonly echoSend: GainNode;
  private readonly echoDelay: DelayNode;
  private readonly echoFeedback: GainNode;
  private readonly echoTone: BiquadFilterNode;
  private readonly reverbSend: GainNode;
  private reverb: ConvolverNode | null = null;
  private readonly duck: GainNode;
  private duckLevel = 1;
  private readonly ducker: SidechainDucker;
  private echoOn = false;
  private reverbOn = false;
  private echoOffTimer: ReturnType<typeof setTimeout> | null = null;
  private reverbOffTimer: ReturnType<typeof setTimeout> | null = null;
  private _effects: MusicEffects = NO_MUSIC_EFFECTS;

  private constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.highpass = context.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.lowpass = context.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.sum = context.createGain();
    this.echoSend = context.createGain();
    this.echoDelay = context.createDelay(2);
    this.echoFeedback = context.createGain();
    this.echoTone = context.createBiquadFilter();
    this.echoTone.type = 'lowpass';
    this.echoTone.frequency.value = ECHO_TONE_HZ;
    this.reverbSend = context.createGain();
    this.duck = context.createGain();
    this.output = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.7;

    this.input.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.sum);
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(this.echoTone);
    this.echoTone.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    this.echoTone.connect(this.sum);
    this.sum.connect(this.duck);
    this.duck.connect(this.output);
    this.output.connect(this.analyser);
    this.applyFilter(NO_MUSIC_EFFECTS.filter, 0);
    this.echoSend.gain.value = 0;
    this.reverbSend.gain.value = 0;

    const taps = [VolumeType.SE, VolumeType.CUT_IN].map((type) => {
      const tap = context.createAnalyser();
      tap.fftSize = 512;
      AudioPlayer.channelNode(type).connect(tap);
      return tap;
    });
    this.ducker = new SidechainDucker(taps, this);
  }

  /** The bus built on the page's audio context, or null while there is none or it could not be built. */
  static get current(): MusicBus | null {
    return MusicBus._instance;
  }

  /**
   * Builds the bus and sets it into the music channel as soon as the page has an audio context,
   * without making one before then. Asking again does nothing more.
   */
  static installWhenReady(): void {
    if (MusicBus.watching) return;
    MusicBus.watching = true;
    AudioPlayer.whenContextReady((context) => MusicBus.install(context));
  }

  /** Lets go of the bus and of what it was asked, as a test starts afresh. Anything playing through it carries on. */
  static forget(): void {
    MusicBus._instance?.ducker.setEnabled(false);
    MusicBus._instance = null;
    MusicBus.duckingWanted = false;
    MusicBus.effectsWanted = NO_MUSIC_EFFECTS;
  }

  /**
   * Turns on or off ducking the music under sound effects and cut-ins, as heard by this listener:
   * a kind they have turned off ducks nothing. Kept for a bus not built yet.
   */
  static setDucking(enabled: boolean): void {
    MusicBus.duckingWanted = enabled;
    MusicBus._instance?.ducker.setEnabled(enabled);
  }

  /** Puts the music through the effects given, easing there over the glide in seconds. Kept for a bus not built yet. */
  static setEffects(effects: MusicEffects, glideS: number = 0.05): void {
    MusicBus.effectsWanted = effects;
    MusicBus._instance?.applyEffects(effects, glideS);
  }

  private static install(context: AudioContext): void {
    if (MusicBus._instance?.context === context) return;
    MusicBus._instance?.ducker.setEnabled(false);
    try {
      const bus = new MusicBus(context);
      AudioPlayer.setChannelInsert(VolumeType.MASTER, bus);
      MusicBus._instance = bus;
      bus.ducker.setEnabled(MusicBus.duckingWanted);
      bus.applyEffects(MusicBus.effectsWanted, 0);
    } catch (reason) {
      MusicBus._instance = null;
      Logger.warn('[MusicBus] 音楽の経路を作れないため、そのまま流します', reason);
    }
  }

  /** How far the music is ducked now, as a factor of its level: 1 while it is not. */
  get ducking(): number {
    return this.duckLevel;
  }

  /** The effects the music is going through. */
  get effects(): MusicEffects {
    return this._effects;
  }

  /** Whether the echo and the reverb are on the music, including while what they hold dies away. */
  get engaged(): { echo: boolean; reverb: boolean } {
    return { echo: this.echoOn, reverb: this.reverbOn };
  }

  /**
   * Ducks the music to a factor of its level, or brings it back with 1, easing there with the time
   * constant given in seconds. Asking for the level it is already easing to does nothing.
   */
  duckTo(level: number, timeConstant: number): void {
    if (level === this.duckLevel) return;
    this.duckLevel = level;
    this.duck.gain.setTargetAtTime(level, this.context.currentTime, Math.max(0.001, timeConstant));
  }

  private applyEffects(effects: MusicEffects, glideS: number): void {
    this._effects = effects;
    const now = this.context.currentTime;
    const constant = Math.max(0.001, glideS / 3);
    this.applyFilter(effects.filter, glideS);
    this.echoDelay.delayTime.setTargetAtTime(Math.min(2, Math.max(0.01, effects.echoDelayS)), now, constant);
    this.echoFeedback.gain.setTargetAtTime(ECHO_BASE_FEEDBACK + ECHO_FEEDBACK_RISE * effects.echo, now, constant);
    this.echoSend.gain.setTargetAtTime(effects.echo, now, constant);
    this.reverbSend.gain.setTargetAtTime(effects.reverb, now, constant);
    this.engageEcho(effects.echo > 0);
    this.engageReverb(effects.reverb > 0);
  }

  private applyFilter(filter: number, glideS: number): void {
    const setting = filterSetting(filter);
    const now = this.context.currentTime;
    const constant = Math.max(0.001, glideS / 3);
    const nyquist = this.context.sampleRate / 2;
    this.lowpass.frequency.setTargetAtTime(Math.min(setting.lowpassHz, nyquist * 0.95), now, constant);
    this.highpass.frequency.setTargetAtTime(setting.highpassHz, now, constant);
    this.lowpass.Q.setTargetAtTime(setting.q, now, constant);
    this.highpass.Q.setTargetAtTime(setting.q, now, constant);
  }

  private engageEcho(on: boolean): void {
    if (this.echoOffTimer !== null) clearTimeout(this.echoOffTimer);
    this.echoOffTimer = null;
    if (on) {
      if (!this.echoOn) this.lowpass.connect(this.echoSend);
      this.echoOn = true;
      return;
    }
    if (!this.echoOn) return;
    this.echoOffTimer = setTimeout(() => {
      this.echoOffTimer = null;
      this.lowpass.disconnect(this.echoSend);
      this.echoOn = false;
    }, ECHO_TAIL_MS);
  }

  private engageReverb(on: boolean): void {
    if (this.reverbOffTimer !== null) clearTimeout(this.reverbOffTimer);
    this.reverbOffTimer = null;
    if (on) {
      if (!this.reverbOn) {
        const reverb = (this.reverb ??= this.makeReverb());
        this.lowpass.connect(this.reverbSend);
        this.reverbSend.connect(reverb);
        reverb.connect(this.sum);
      }
      this.reverbOn = true;
      return;
    }
    if (!this.reverbOn) return;
    this.reverbOffTimer = setTimeout(() => {
      this.reverbOffTimer = null;
      this.lowpass.disconnect(this.reverbSend);
      this.reverbSend.disconnect();
      this.reverb?.disconnect();
      this.reverbOn = false;
    }, REVERB_TAIL_MS);
  }

  /** A hall made up rather than recorded: two channels of noise dying away, darker as they die, a little apart from each other. */
  private makeReverb(): ConvolverNode {
    const rate = this.context.sampleRate;
    const length = Math.round(REVERB_LENGTH_S * rate);
    const impulse = this.context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      let state = 0x9e3779b9 + channel * 0x6d2b79f5;
      let smoothed = 0;
      for (let i = 0; i < length; i++) {
        state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
        const noise = state / 0x100000000 - 0.5;
        const t = i / length;
        const darkening = 0.05 + 0.9 * t;
        smoothed += (noise - smoothed) * (1 - darkening);
        samples[i] = smoothed * Math.pow(1 - t, 3) * 2;
      }
    }
    const convolver = this.context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }
}
