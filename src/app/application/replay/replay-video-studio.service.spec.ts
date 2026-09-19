import { TestBed } from '@angular/core/testing';
import { ReplayFontLoader } from '@axe/application/replay/replay-font-loader.service';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import {
  ReplayVideoAudience,
  type ReplayVideoSettings,
  ReplayVideoStudioService,
} from '@axe/application/replay/replay-video-studio.service';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const line: ReplayEvent = {
  seq: 1,
  at: 1000,
  t: 1000,
  kind: ReplayEventKind.ChatMessage,
  actorId: 'alice',
  detail: { text: 'やあ', name: 'アリス' },
  visibility: PUBLIC_VISIBILITY,
};

const recording = { id: 1, roomName: '第一夜', startedAt: 0, manifest: null, events: [line], userId: '' };
const settings: ReplayVideoSettings = {
  style: ReplayVideoStyle.Novel,
  audience: ReplayVideoAudience.Public,
  lang: 'ja',
  width: 1280,
  height: 720,
  pacing: ReplayVideoPacing.Reading,
  readingSpeed: 1,
  tabs: null,
  withOpening: false,
};

describe('ReplayVideoStudioService', () => {
  let service: ReplayVideoStudioService;
  let fontsLoad: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

  beforeEach(() => {
    fontsLoad = vi.fn<() => Promise<boolean>>();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: ReplayLibraryService, useValue: { keyframeBefore: vi.fn().mockResolvedValue(null) } },
        { provide: ReplayFontLoader, useValue: { load: fontsLoad } },
      ],
    });
    service = TestBed.inject(ReplayVideoStudioService);
  });

  it('lays the video out knowing the bundled fonts are there, once they have loaded', async () => {
    fontsLoad.mockResolvedValue(true);

    const made = await service.produce(recording, settings);

    expect(made.share().bundledFonts).toBe(true);
    made.dispose();
  });

  it('lays it out knowing the device fonts are standing in, when the bundled ones fail to load', async () => {
    fontsLoad.mockResolvedValue(false);

    const made = await service.produce(recording, settings);

    expect(made.share().bundledFonts).toBe(false);
    made.dispose();
  });
});
