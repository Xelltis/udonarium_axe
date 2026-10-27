import { USER_GESTURE_EVENTS } from '@axe/core/input/user-interaction-unlock';

/**
 * The channels sound plays through, each with a volume of its own that the listener sets.
 *
 * Music, previews, sound effects and background sounds came first. Cut-ins, notifications, the
 * sounds of handling things on the table, and the sounds of effects were split off from the sound
 * effects so that each can be turned down or off on its own.
 */
export enum VolumeType {
  MASTER,
  AUDITION,
  SE,
  BACKGROUND,
  CUT_IN,
  NOTIFICATION,
  HANDLING,
  EFFECT,
}

/** Every channel, in the order of `VolumeType`. */
export const VOLUME_TYPES: readonly VolumeType[] = [
  VolumeType.MASTER,
  VolumeType.AUDITION,
  VolumeType.SE,
  VolumeType.BACKGROUND,
  VolumeType.CUT_IN,
  VolumeType.NOTIFICATION,
  VolumeType.HANDLING,
  VolumeType.EFFECT,
];

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}

/**
 * Something set between one channel's players and the channel's volume, such as the music's
 * effects: where the players' sound goes in and where it comes out.
 */
export interface ChannelInsert {
  readonly input: AudioNode;
  readonly output: AudioNode;
}

type Channel = { volume: number; node?: GainNode; insert: ChannelInsert | null };

/** The page's way out to the speakers: its one audio context, and a channel with a volume for each kind of sound. */
export class AudioOutput {
  private static _context: AudioContext | undefined;
  private static readonly contextListeners: ((context: AudioContext) => void)[] = [];
  private static readonly channels = new Map<VolumeType, Channel>();

  /**
   * The one Web Audio context every player and sound effect on the page goes through, created on
   * first use.
   *
   * Browsers keep it suspended until the user interacts with the page; see `resumeOnGesture`.
   */
  static get context(): AudioContext {
    if (!AudioOutput._context) {
      AudioOutput._context = new (window.AudioContext || window.webkitAudioContext)();
      for (const listener of AudioOutput.contextListeners) listener(AudioOutput._context);
    }
    return AudioOutput._context;
  }

  /**
   * Runs something each time the page's audio context is made, and at once if it already is, so
   * what hangs off it can be built without making a context before anything plays: a browser warns
   * of a context made before the user has touched the page.
   *
   * Answers with a function that stops running it for contexts made later.
   */
  static whenContextReady(listener: (context: AudioContext) => void): () => void {
    AudioOutput.contextListeners.push(listener);
    if (AudioOutput._context) listener(AudioOutput._context);
    return () => {
      const at = AudioOutput.contextListeners.indexOf(listener);
      if (at >= 0) AudioOutput.contextListeners.splice(at, 1);
    };
  }

  /** The volume of one channel, from 0 to 1, which is half until it is set. */
  static channelVolume(type: VolumeType): number {
    return AudioOutput.channel(type).volume;
  }

  /**
   * Sets the volume of one channel, from 0 to 1, for everything playing through it and all that plays
   * through it later.
   *
   * The channel glides to the new level over a few milliseconds rather than jumping.
   */
  static setChannelVolume(type: VolumeType, volume: number): void {
    AudioOutput.channel(type).volume = volume;
    AudioOutput.channelNode(type).gain.setTargetAtTime(volume, AudioOutput.context.currentTime, 0.01);
  }

  /**
   * The gain node of one channel, its volume. Each channel runs straight to the speakers, so one
   * channel's volume never touches another's.
   */
  static channelNode(type: VolumeType): GainNode {
    const channel = AudioOutput.channel(type);
    if (!channel.node) {
      const context = AudioOutput.context;
      const gain = context.createGain();
      gain.gain.setValueAtTime(channel.volume, context.currentTime);
      gain.connect(context.destination);
      channel.node = gain;
    }
    return channel.node;
  }

  /**
   * Where the players and sounds of one channel connect: whatever is set between them and the
   * channel's volume, or the volume itself while nothing is.
   */
  static channelInput(type: VolumeType): AudioNode {
    return AudioOutput.channel(type).insert?.input ?? AudioOutput.channelNode(type);
  }

  /**
   * Sets something between one channel's players and its volume, its output running into the
   * volume. It is meant to be set once, before anything plays through the channel: what started
   * playing before it keeps going straight to the volume until it plays again.
   */
  static setChannelInsert(type: VolumeType, insert: ChannelInsert): void {
    const channel = AudioOutput.channel(type);
    if (channel.insert === insert) return;
    insert.output.connect(AudioOutput.channelNode(type));
    channel.insert = insert;
  }

  /**
   * Starts the audio context on a gesture the browser counts, and again whenever it stops.
   *
   * iOS lets a context start from a finger lifting, a press or a key, but not from a touch that
   * has only begun. It stops the context again when the page is put away or a call comes in, so
   * the listeners stay until the context is running and come back whenever it is not.
   */
  static resumeOnGesture(): void {
    let watching = false;
    const listen = () => {
      for (const type of USER_GESTURE_EVENTS) document.addEventListener(type, resume, true);
    };
    const stopListening = () => {
      for (const type of USER_GESTURE_EVENTS) document.removeEventListener(type, resume, true);
    };
    const resume = () => {
      const context = AudioOutput.context;
      if (!watching) {
        watching = true;
        context.addEventListener?.('statechange', () => {
          if (context.state !== 'running') listen();
        });
      }
      void Promise.resolve(context.resume()).then(
        () => {
          if (context.state === 'running') stopListening();
        },
        () => undefined
      );
    };
    listen();
  }

  private static channel(type: VolumeType): Channel {
    let channel = AudioOutput.channels.get(type);
    if (!channel) {
      channel = { volume: 0.5, insert: null };
      AudioOutput.channels.set(type, channel);
    }
    return channel;
  }
}
