import { TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { emitSoundOnlyCutIn, emitStartCutIn, emitStopCutIn, emitStopCutInByBgm } from '@axe/core/event/domain-events';
import { VolumeType } from '@axe/core/storage/audio-output';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInMultiDirectionMode } from '@axe/domain/tabletop/cut-in-multi-direction';
import {
  CUT_IN_MULTI_DIRECTION_PREPARE_TIMEOUT_MS,
  CutInEventHandlerService,
} from '@axe/features/media/cut-in-event-handler.service';
import { CUT_IN_WINDOW_LOADER, type CutInWindowType } from '@axe/features/media/cut-in-window-loader';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeCutIn(overrides: Partial<CutIn> = {}): CutIn {
  return {
    identifier: 'cut-1',
    name: 'sample',
    width: 320,
    height: 240,
    x_pos: 50,
    y_pos: 50,
    videoId: '',
    audioIdentifier: '',
    frameless: false,
    ...overrides,
  } as unknown as CutIn;
}

describe('CutInEventHandlerService', () => {
  let panelStub: { open: ReturnType<typeof vi.fn> };
  let audioStub: { get: ReturnType<typeof vi.fn> };
  let service: CutInEventHandlerService;

  function useTable(mode: CutInMultiDirectionMode, mode2d = true): void {
    const table = TestBed.inject(TabletopService).currentTable;
    table.mode2d = mode2d;
    table.cutInMultiDirectionMode = mode;
  }

  beforeEach(async () => {
    panelStub = {
      open: vi.fn().mockReturnValue({
        cutIn: null,
        forceNoLoop: false,
        prepareCutIn: vi.fn().mockResolvedValue(undefined),
        startCutIn: vi.fn(),
      }),
    };
    audioStub = { get: vi.fn() };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    TestBed.overrideProvider(AudioStorage, { useValue: audioStub });
    service = TestBed.inject(CutInEventHandlerService);
    await service.prepareWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens a panel and hands the cut-in to it', () => {
    const cutIn = makeCutIn({ name: 'attack' });
    const componentMock = { cutIn: null, forceNoLoop: true, startCutIn: vi.fn() };
    panelStub.open.mockReturnValue(componentMock);

    emitStartCutIn({ cutIn });

    expect(panelStub.open).toHaveBeenCalledTimes(1);
    expect(panelStub.open.mock.calls[0][1].title).toContain('attack');
    expect(componentMock.cutIn).toBe(cutIn);
    expect(componentMock.forceNoLoop).toBe(false);
    expect(componentMock.startCutIn).toHaveBeenCalled();
  });

  it('keeps the panel at the least size a video needs while the cut-in in the room plays one', () => {
    const cutIn = new CutIn('cut-video');
    cutIn.initialize();
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://youtu.be/youtube123';

    emitStartCutIn({ cutIn });
    const leastSize = panelStub.open.mock.calls[0][1].leastSize as () => unknown;

    expect(leastSize()).toEqual({ width: cutIn.minSizeWidth(true), height: cutIn.minSizeHeight(true) });
    cutIn.isVideoCutIn = false;
    expect(leastSize()).toBeNull();
    cutIn.isVideoCutIn = true;
    cutIn.destroy();
    expect(leastSize()).toBeNull();
  });

  it('leaves room above a framed cut-in for the title bar', () => {
    emitStartCutIn({ cutIn: makeCutIn() });

    expect(panelStub.open.mock.calls[0][1].height).toBe(265);
    expect(panelStub.open.mock.calls[0][1].frameless).toBe(false);
  });

  it('gives a frameless cut-in the whole panel', () => {
    emitStartCutIn({ cutIn: makeCutIn({ frameless: true }) });

    expect(panelStub.open.mock.calls[0][1].height).toBe(240);
    expect(panelStub.open.mock.calls[0][1].frameless).toBe(true);
  });

  it('opens an invisible panel for a sound-only cut-in carrying a video', () => {
    const cutIn = makeCutIn({ videoId: 'youtube123' });
    panelStub.open.mockReturnValue({ cutIn: null, forceNoLoop: false, startCutIn: vi.fn() });

    emitSoundOnlyCutIn({ cutIn });

    expect(panelStub.open).toHaveBeenCalledTimes(1);
    expect(panelStub.open.mock.calls[0][1].invisible).toBe(true);
  });

  it.each([
    ['vertical', 2],
    ['vertical-right', 3],
    ['vertical-left', 3],
    ['four-directions', 4],
  ] as const)('opens the requested number of panels for %s', (mode, count) => {
    useTable(mode);
    const components = Array.from({ length: count }, () => ({
      cutIn: null,
      audioEnabled: true,
      panelLayout: null,
      prepareCutIn: vi.fn().mockResolvedValue(undefined),
      startCutIn: vi.fn(),
    }));
    panelStub.open.mockImplementation(() => components.shift());

    emitStartCutIn({ cutIn: makeCutIn() });

    expect(panelStub.open).toHaveBeenCalledTimes(count);
  });

  it('places two-way panels in the existing cardinal directions and gives audio only to south', async () => {
    useTable('vertical');
    const components = Array.from({ length: 2 }, () => ({
      cutIn: null,
      audioEnabled: true,
      panelLayout: null,
      prepareCutIn: vi.fn().mockResolvedValue(undefined),
      startCutIn: vi.fn(),
    }));
    panelStub.open.mockImplementation(() => components[panelStub.open.mock.calls.length - 1]);
    const cutIn = makeCutIn({ frameless: false });

    emitStartCutIn({ cutIn });

    expect(panelStub.open.mock.calls.map((call) => call[1].rotationDegrees)).toEqual([180, 0]);
    expect(panelStub.open.mock.calls.every((call) => call[1].frameless === false)).toBe(true);
    expect(components.map((component) => component.audioEnabled)).toEqual([false, true]);
    expect(components.every((component) => component.cutIn === cutIn)).toBe(true);
    await vi.waitFor(() =>
      expect(components.every((component) => component.startCutIn.mock.calls.length === 1)).toBe(true)
    );
    const startedAt = components.map((component) => component.startCutIn.mock.calls[0][0]);
    expect(new Set(startedAt).size).toBe(1);
    expect(components[0].startCutIn).toHaveBeenCalledWith(startedAt[0], undefined);
    expect(components[1].startCutIn).toHaveBeenCalledWith(startedAt[0], 0);
    expect(components[1].startCutIn.mock.invocationCallOrder[0]).toBeLessThan(
      components[0].startCutIn.mock.invocationCallOrder[0]
    );
  });

  it('starts no multi-direction face until every face is prepared', async () => {
    useTable('vertical');
    let releaseNorth!: () => void;
    let releaseSouth!: () => void;
    const northReady = new Promise<void>((resolve) => (releaseNorth = resolve));
    const southReady = new Promise<void>((resolve) => (releaseSouth = resolve));
    const components = [northReady, southReady].map((ready) => ({
      cutIn: null,
      audioEnabled: true,
      panelLayout: null,
      prepareCutIn: vi.fn().mockReturnValue(ready),
      startCutIn: vi.fn(),
    }));
    panelStub.open.mockImplementation(() => components[panelStub.open.mock.calls.length - 1]);

    emitStartCutIn({ cutIn: makeCutIn() });
    releaseNorth();
    await Promise.resolve();

    expect(components.every((component) => component.startCutIn.mock.calls.length === 0)).toBe(true);

    releaseSouth();
    await vi.waitFor(() =>
      expect(components.every((component) => component.startCutIn.mock.calls.length === 1)).toBe(true)
    );
  });

  it('starts prepared faces after the shared preparation timeout', async () => {
    vi.useFakeTimers();
    useTable('vertical');
    const components = Array.from({ length: 2 }, () => ({
      cutIn: null,
      audioEnabled: true,
      panelLayout: null,
      prepareCutIn: vi.fn().mockReturnValue(new Promise<void>(() => {})),
      startCutIn: vi.fn(),
    }));
    panelStub.open.mockImplementation(() => components[panelStub.open.mock.calls.length - 1]);

    emitStartCutIn({ cutIn: makeCutIn() });
    await vi.advanceTimersByTimeAsync(CUT_IN_MULTI_DIRECTION_PREPARE_TIMEOUT_MS - 1);
    expect(components.every((component) => component.startCutIn.mock.calls.length === 0)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(components.every((component) => component.startCutIn.mock.calls.length === 1)).toBe(true);
    vi.useRealTimers();
  });

  it('uses one ordinary panel outside 2D mode', () => {
    useTable('four-directions', false);

    emitStartCutIn({ cutIn: makeCutIn() });

    expect(panelStub.open).toHaveBeenCalledTimes(1);
    expect(panelStub.open.mock.calls[0][1].rotationDegrees).toBeUndefined();
  });

  it('keeps a sound-only video to one invisible panel in multi-direction mode', () => {
    useTable('four-directions');

    emitSoundOnlyCutIn({ cutIn: makeCutIn({ videoId: 'youtube123' }) });

    expect(panelStub.open).toHaveBeenCalledTimes(1);
    expect(panelStub.open.mock.calls[0][1].invisible).toBe(true);
  });

  it('opens nothing and plays nothing for a sound-only cut-in with neither', () => {
    audioStub.get.mockReturnValue(undefined);
    const cutIn = makeCutIn({ audioIdentifier: 'missing' });

    emitSoundOnlyCutIn({ cutIn });

    expect(audioStub.get).toHaveBeenCalledWith('missing');
    expect(panelStub.open).not.toHaveBeenCalled();
  });

  it('does nothing for a missing cut-in', () => {
    emitSoundOnlyCutIn({ cutIn: null });

    expect(panelStub.open).not.toHaveBeenCalled();
    expect(audioStub.get).not.toHaveBeenCalled();
  });

  it('plays a sound-effect-tagged sound-only cut-in through the cut-in volume, not the effects', () => {
    vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
    vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
    audioStub.get.mockReturnValue({ identifier: 'se-id' });
    const tag = AudioTag.create('se-id');
    tag.tag = 'SE';

    emitSoundOnlyCutIn({ cutIn: makeCutIn({ audioIdentifier: 'se-id' }) });

    const player = (service as unknown as { soundOnlyPlayer: AudioPlayer }).soundOnlyPlayer;
    expect(player.volumeType).toBe(VolumeType.CUT_IN);
  });

  it('plays any other sound-only cut-in through the cut-in volume, not the music', () => {
    vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
    vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
    audioStub.get.mockReturnValue({ identifier: 'bgm-id' });

    emitSoundOnlyCutIn({ cutIn: makeCutIn({ audioIdentifier: 'bgm-id' }) });

    const player = (service as unknown as { soundOnlyPlayer: AudioPlayer }).soundOnlyPlayer;
    expect(player.volumeType).toBe(VolumeType.CUT_IN);
  });
});

describe('CutInEventHandlerService before its window arrives', () => {
  let panelStub: { open: ReturnType<typeof vi.fn> };
  let audioStub: { get: ReturnType<typeof vi.fn> };
  let service: CutInEventHandlerService;
  let arrive: () => void;

  beforeEach(() => {
    panelStub = { open: vi.fn().mockReturnValue({ cutIn: null, forceNoLoop: false, startCutIn: vi.fn() }) };
    audioStub = { get: vi.fn() };
    const windowArrives = new Promise<CutInWindowType>((resolve) => {
      arrive = () => resolve(class {} as unknown as CutInWindowType);
    });
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    TestBed.overrideProvider(AudioStorage, { useValue: audioStub });
    TestBed.overrideProvider(CUT_IN_WINDOW_LOADER, { useValue: () => windowArrives });
    service = TestBed.inject(CutInEventHandlerService);
    TestBed.inject(TabletopService).currentTable.mode2d = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a cut-in asked for meanwhile once the window is here', async () => {
    emitStartCutIn({ cutIn: makeCutIn() });

    expect(panelStub.open).not.toHaveBeenCalled();
    arrive();
    await service.prepareWindow();
    await vi.waitFor(() => expect(panelStub.open).toHaveBeenCalledTimes(1));
  });

  it('opens nothing for a cut-in stopped while the window was on its way', async () => {
    const cutIn = makeCutIn();
    emitStartCutIn({ cutIn });
    emitStopCutIn({ cutIn });
    emitStartCutIn({ cutIn: makeCutIn({ identifier: 'cut-2' }) });

    arrive();
    await service.prepareWindow();
    await vi.waitFor(() => expect(panelStub.open).toHaveBeenCalledTimes(1));
    expect(panelStub.open.mock.calls[0][1].cutInIdentifier).toBe('cut-2');
  });

  it('opens nothing for an untagged cut-in with music once music stops it meanwhile', async () => {
    audioStub.get.mockImplementation((id: string) => (id === 'bgm' ? { identifier: 'bgm' } : undefined));
    emitStartCutIn({ cutIn: makeCutIn({ audioIdentifier: 'bgm', tagName: '' }) });
    emitStopCutInByBgm();
    emitStartCutIn({ cutIn: makeCutIn({ identifier: 'cut-2', audioIdentifier: '', tagName: '' }) });

    arrive();
    await service.prepareWindow();
    await vi.waitFor(() => expect(panelStub.open).toHaveBeenCalledTimes(1));
    expect(panelStub.open.mock.calls[0][1].cutInIdentifier).toBe('cut-2');
  });

  it('opens only the last of the cut-ins sharing a tag, or the same one, asked for meanwhile', async () => {
    const cutIn = makeCutIn({ identifier: 'cut-1', tagName: '' });
    emitStartCutIn({ cutIn });
    emitStartCutIn({ cutIn });
    emitStartCutIn({ cutIn: makeCutIn({ identifier: 'cut-2', tagName: '' }) });
    emitStartCutIn({ cutIn: makeCutIn({ identifier: 'cut-3', tagName: 'face' }) });

    arrive();
    await service.prepareWindow();
    await vi.waitFor(() => expect(panelStub.open).toHaveBeenCalledTimes(2));
    expect(panelStub.open.mock.calls.map(([, option]) => option.cutInIdentifier)).toEqual(['cut-2', 'cut-3']);
  });

  it('opens only the sound-only window when the same video is asked for sound only meanwhile', async () => {
    const cutIn = makeCutIn({ videoId: 'youtube123' });
    emitStartCutIn({ cutIn });
    emitSoundOnlyCutIn({ cutIn });

    arrive();
    await service.prepareWindow();
    await vi.waitFor(() => expect(panelStub.open).toHaveBeenCalledTimes(1));
    expect(panelStub.open.mock.calls[0][1].invisible).toBe(true);
  });
});
