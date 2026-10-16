import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import type { ReplayEvent } from '@axe/domain/replay/replay-event';
import { ReplayStagingBannerComponent } from '@axe/features/replay/replay-staging-banner/replay-staging-banner.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReplayStagingBannerComponent', () => {
  const manifest = {
    actors: [
      { userId: 'alice', name: '盗賊' },
      { userId: 'bob', name: '魔術師' },
    ],
    targets: [],
  };

  it('shows the one the scene is credited to as chosen, not the first in the list', async () => {
    await TestBed.configureTestingModule({
      imports: [ReplayStagingBannerComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayStagingService,
          useValue: {
            isStaging: signal(true).asReadonly(),
            captured: signal<readonly ReplayEvent[]>([]).asReadonly(),
            actorId: signal('bob').asReadonly(),
            insertIndex: signal(0).asReadonly(),
            setActorId: vi.fn(),
          },
        },
        { provide: ReplayEditorService, useValue: { insertMany: vi.fn() } },
        {
          provide: ReplayPlaybackService,
          useValue: {
            manifest: signal(manifest).asReadonly(),
            events: signal<readonly ReplayEvent[]>([]).asReadonly(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReplayStagingBannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('魔術師');
  });

  it('credits the scene to the one chosen', async () => {
    const setActorId = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ReplayStagingBannerComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayStagingService,
          useValue: {
            isStaging: signal(true).asReadonly(),
            captured: signal<readonly ReplayEvent[]>([]).asReadonly(),
            actorId: signal('alice').asReadonly(),
            insertIndex: signal(0).asReadonly(),
            setActorId,
          },
        },
        { provide: ReplayEditorService, useValue: { insertMany: vi.fn() } },
        {
          provide: ReplayPlaybackService,
          useValue: {
            manifest: signal(manifest).asReadonly(),
            events: signal<readonly ReplayEvent[]>([]).asReadonly(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReplayStagingBannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));

    expect(setActorId).toHaveBeenCalledWith('bob');
  });
});
