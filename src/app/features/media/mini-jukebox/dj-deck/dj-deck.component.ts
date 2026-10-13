import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MusicBus } from '@axe/core/audio/music-bus';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { hasDjEffects } from '@axe/domain/media/dj-effects';
import { CROSSFADE_CHOICES, PAUSE_FADE_CHOICES } from '@axe/domain/media/dj-settings';
import { BeatLightPreferenceService } from '@axe/features/media/beat-light/beat-light-preference.service';
import { DjConsoleService, type PadView } from '@axe/features/media/dj-console.service';
import { formatTrackTime, JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { UiKnobComponent } from '@axe/ui/components/knob/knob.component';
import { TranslocoModule } from '@jsverse/transloco';

const SPECTRUM_BARS = 28;
/** How much of a beat the beat's dot stays lit for, from its start. */
const BEAT_FLASH = 0.2;

/**
 * The DJ deck under the mini player: a picture of the music, the tempo of the room's track with its
 * beats counted out, the taps and buttons to set the beats by hand, how loud the track was read and
 * how far it is turned to level it, and the room's mixing settings.
 *
 * The picture and the beat are drawn on every animation frame while the deck is open, which stops by
 * itself while the tab is in the background.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dj-deck',
  templateUrl: './dj-deck.component.html',
  imports: [FormsModule, TranslocoModule, UiKnobComponent],
})
export class DjDeckComponent {
  protected readonly dj = inject(DjConsoleService);
  protected readonly playback = inject(JukeboxPlaybackService);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly spectrum = viewChild<ElementRef<HTMLCanvasElement>>('spectrum');

  protected readonly beats = [0, 1, 2, 3];
  protected readonly tabs = ['deck', 'pads', 'mix'] as const;

  /** The part of the deck shown under the tempo: the deck itself, the pads, or the room's mix. */
  readonly activeTab = signal<'deck' | 'pads' | 'mix'>('deck');

  /** The pad a sound is being chosen for, counted from 1, or null while none is. */
  readonly pickingSlot = signal<number | null>(null);

  /** Whether each pad's sound is sounding on this peer. */
  readonly padsSounding = signal<readonly boolean[]>([]);
  protected readonly crossfadeChoices = CROSSFADE_CHOICES;
  protected readonly pauseFadeChoices = PAUSE_FADE_CHOICES;

  /** The beat of the bar the room's track is in on this peer, or -1 while it plays none. */
  readonly beatOfBar = signal(-1);
  /** Whether the room's track is just on a beat. */
  readonly onBeat = signal(false);

  /** The tempo as shown: one decimal, or a dash while none is known. */
  readonly bpmText = computed(() => {
    const grid = this.dj.grid();
    return grid ? grid.bpm.toFixed(1) : '—';
  });

  /** What is known of the track's beat, for the line under the tempo: being read, none found, set by hand, or read. */
  readonly tempoState = computed<'none' | 'analyzing' | 'noBeat' | 'manual' | 'read'>(() => {
    if (!this.dj.track()) return 'none';
    if (this.dj.isGridManual()) return 'manual';
    if (this.dj.grid()) return 'read';
    return this.dj.isAnalyzing() ? 'analyzing' : 'noBeat';
  });

  /** Whether any effect is on, so they can be turned off together. */
  readonly hasEffects = computed(() => hasDjEffects(this.dj.effects()));

  /** Where the filter stands, in words: which way and how far, or off. */
  readonly filterText = computed(() => {
    const filter = this.dj.effects().filter;
    if (filter === 0) return 'off';
    return `${filter < 0 ? 'low-pass' : 'high-pass'} ${Math.round(Math.abs(filter) * 100)}%`;
  });

  /** The track's loudness as read, to a tenth of a LUFS, or a dash. */
  readonly loudnessText = computed(() => {
    const lufs = this.dj.trackAnalysis()?.lufs;
    return typeof lufs === 'number' ? lufs.toFixed(1) : '—';
  });

  /** How far the track is turned up or down to level it, signed, to a tenth of a dB. */
  readonly levelText = computed(() => {
    const db = this.dj.levelDb();
    const rounded = Math.round(db * 10) / 10;
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded).toFixed(1)}`;
  });

  private frame = 0;
  private frames = 0;
  private accent = '';
  private bars = new Uint8Array(0);
  private cleared = false;

  constructor() {
    afterNextRender(() => {
      const draw = () => {
        this.frame = requestAnimationFrame(draw);
        this.tick();
      };
      this.frame = requestAnimationFrame(draw);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  /** Sets a pad off, or opens the choice of sound for an empty one. */
  pressPad(pad: PadView): void {
    if (pad.identifier === '') this.pickingSlot.set(pad.slot + 1);
    else this.dj.firePad(pad.slot);
  }

  /** Gives a pad the sound chosen and closes the choice. */
  assign(slot: number, identifier: string): void {
    this.dj.assignPad(slot, identifier);
    this.pickingSlot.set(null);
  }

  /** The icon of what a pad sets off. */
  padIcon(pad: PadView): string {
    if (pad.kind === 'effect') return 'flash_on';
    return pad.kind === 'background' ? 'waves' : 'music_note';
  }

  /** The tag of a sound, BGM for one never tagged. */
  tagOf(identifier: string): string {
    return AudioTag.get(identifier)?.tag ?? 'BGM';
  }

  /** Turns levelling on or off for the room. */
  toggleAutoLevel(): void {
    this.dj.setSettings({ autoLevel: !this.dj.settings().autoLevel });
  }

  /** Turns ducking on or off for the room. */
  toggleDucking(): void {
    this.dj.setSettings({ ducking: !this.dj.settings().ducking });
  }

  private readonly beatLightPreference = inject(BeatLightPreferenceService);

  /** Whether this reader keeps the beat light off on their own screen. */
  readonly beatLightOff = this.beatLightPreference.off;

  /** Turns the beat light on or off for the room. */
  toggleBeatLight(): void {
    this.dj.setSettings({ beatLight: !this.dj.settings().beatLight });
  }

  /** Keeps the beat light off on this reader's screen, or lets it show again. */
  setBeatLightOff(off: boolean): void {
    this.beatLightPreference.setOff(off);
  }

  /** Turns quantising on or off for the room. */
  toggleQuantize(): void {
    this.dj.setSettings({ quantize: !this.dj.settings().quantize });
  }

  /** A marked place as shown on its pad. */
  cueTime(seconds: number): string {
    return formatTrackTime(seconds);
  }

  /** Sets how long the room's music fades out when paused or stopped, and back in when it goes on. */
  setPauseFade(seconds: number): void {
    this.dj.setSettings({ pauseFadeS: seconds });
  }

  /** Sets how long the room's tracks fade into each other. */
  setCrossfade(seconds: number): void {
    this.dj.setSettings({ crossfadeS: seconds });
  }

  private tick(): void {
    if (this.activeTab() === 'pads') {
      const sounding = this.dj.pads().map((pad) => this.dj.isPadSounding(pad));
      const before = this.padsSounding();
      if (sounding.some((on, slot) => on !== before[slot])) this.padsSounding.set(sounding);
    }
    const playing = this.playback.isPlaying();
    const clock = playing ? this.dj.beatClock() : null;
    this.beatOfBar.set(clock?.beatOfBar ?? -1);
    this.onBeat.set(clock !== null && clock.fraction < BEAT_FLASH);
    this.drawSpectrum(playing);
  }

  private drawSpectrum(playing: boolean): void {
    const canvas = this.spectrum()?.nativeElement;
    const analyser = MusicBus.current?.analyser;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.cleared = false;
    }
    if (!playing || !analyser) {
      if (!this.cleared) context.clearRect(0, 0, width, height);
      this.cleared = true;
      return;
    }
    this.cleared = false;
    if (this.bars.length !== analyser.frequencyBinCount) this.bars = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(this.bars);
    context.clearRect(0, 0, width, height);
    if (this.frames++ % 60 === 0) {
      this.accent = getComputedStyle(this.host.nativeElement).getPropertyValue('--ui-accent').trim();
    }
    context.fillStyle = this.accent || '#4af';
    const gap = Math.max(1, Math.round(devicePixelRatio));
    const barWidth = (width - gap * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS;
    const bins = this.bars.length;
    for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
      const from = Math.floor(Math.pow(bins, bar / SPECTRUM_BARS));
      const to = Math.max(from + 1, Math.floor(Math.pow(bins, (bar + 1) / SPECTRUM_BARS)));
      let peak = 0;
      for (let bin = from; bin < Math.min(to, bins); bin++) peak = Math.max(peak, this.bars[bin]);
      const barHeight = Math.max(gap, (peak / 255) * height);
      context.fillRect(bar * (barWidth + gap), height - barHeight, barWidth, barHeight);
    }
  }
}
