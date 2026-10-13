import { SidechainDucker } from '@axe/core/audio/sidechain-ducker';
import { Logger } from '@axe/core/logging/logger';
import { AudioPlayer, type ChannelInsert, VolumeType } from '@axe/core/storage/audio-player';

/**
 * The way the room's music goes between its players and its volume, set into the music channel:
 * where it is ducked under sound effects and cut-ins, and a tap that meters read it from.
 *
 * There is one for the page, built on the audio context. Where the page cannot build it, as with
 * an audio context too old to have what it needs, the music goes straight to its volume as before.
 */
export class MusicBus implements ChannelInsert {
  private static _instance: MusicBus | null = null;
  private static watching = false;
  private static duckingWanted = false;

  /** Where the players' music goes in. */
  readonly input: GainNode;
  /** Where the music comes out to its volume. */
  readonly output: GainNode;
  /** A tap after everything, for meters and pictures of the music; it leads nowhere audible. */
  readonly analyser: AnalyserNode;
  private readonly duck: GainNode;
  private duckLevel = 1;
  private readonly ducker: SidechainDucker;

  private constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.duck = context.createGain();
    this.output = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.7;
    this.input.connect(this.duck);
    this.duck.connect(this.output);
    this.output.connect(this.analyser);
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
  }

  /**
   * Turns on or off ducking the music under sound effects and cut-ins, as heard by this listener:
   * a kind they have turned off ducks nothing. Kept for a bus not built yet.
   */
  static setDucking(enabled: boolean): void {
    MusicBus.duckingWanted = enabled;
    MusicBus._instance?.ducker.setEnabled(enabled);
  }

  private static install(context: AudioContext): void {
    if (MusicBus._instance?.context === context) return;
    MusicBus._instance?.ducker.setEnabled(false);
    try {
      const bus = new MusicBus(context);
      AudioPlayer.setChannelInsert(VolumeType.MASTER, bus);
      MusicBus._instance = bus;
      bus.ducker.setEnabled(MusicBus.duckingWanted);
    } catch (reason) {
      MusicBus._instance = null;
      Logger.warn('[MusicBus] 音楽の経路を作れないため、そのまま流します', reason);
    }
  }

  /** How far the music is ducked now, as a factor of its level: 1 while it is not. */
  get ducking(): number {
    return this.duckLevel;
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
}
