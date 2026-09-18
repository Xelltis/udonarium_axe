import '@angular/compiler';

import { EnvironmentProviders, NO_ERRORS_SCHEMA, Provider } from '@angular/core';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed, TestModuleMetadata } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { Logger, LogLevel } from '@axe/core/logging/logger';
import { resetPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';

Logger.setLevel(LogLevel.NONE);

import { LOCAL_MODE_STORAGE_KEY } from '@axe/application/ui/local-mode-preference.service';
import { PIECE_OVERLAY_STORAGE_KEY } from '@axe/application/ui/piece-overlay-preference.service';
import { TABLETOP_DISPLAY_STORAGE_KEY } from '@axe/application/ui/tabletop-display-preference.service';
import { TOOLBAR_FOLD_STORAGE_KEY } from '@axe/application/ui/toolbar-fold.service';
import { WIDGET_VISIBILITY_STORAGE_KEY } from '@axe/application/ui/widget-visibility.service';
import { VIEW_MODE_STORAGE_KEY } from '@axe/application/ui/view-mode-preference.service';

const srcAppDir = resolve(process.cwd(), 'src/app');
const fileMap = new Map<string, string>();

function buildFileMap(dir: string): void {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      buildFileMap(fullPath);
    } else if (name.endsWith('.html') || name.endsWith('.css')) {
      fileMap.set(name, fullPath);
    }
  }
}
buildFileMap(srcAppDir);

const resourceResolver = (url: string): Promise<{ text(): Promise<string> }> => {
  const name = basename(url);
  const absPath = fileMap.get(name);
  const content = absPath ? readFileSync(absPath, 'utf-8') : '';
  return Promise.resolve({ text: () => Promise.resolve(content) });
};

// happy-dom has no WebRTC API; @skyway-sdk/core touches RTC* at import time.
if (typeof globalThis.RTCPeerConnection === 'undefined') {
  const emptyTrack = {
    stop() {},
    getConstraints() {
      return {};
    },
  };
  (globalThis as unknown as Record<string, unknown>)['RTCPeerConnection'] = class RTCPeerConnection {
    addTransceiver() {
      return { sender: { track: emptyTrack }, receiver: { track: emptyTrack } };
    }
    close() {}
    createDataChannel() {
      return {};
    }
  };
  (globalThis as unknown as Record<string, unknown>)['RTCSessionDescription'] = class RTCSessionDescription {};
  (globalThis as unknown as Record<string, unknown>)['RTCIceCandidate'] = class RTCIceCandidate {};
}
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      addEventListener() {},
      removeEventListener() {},
      enumerateDevices() {
        return Promise.resolve([]);
      },
      getUserMedia() {
        return Promise.resolve({
          getTracks() {
            return [];
          },
        });
      },
      getDisplayMedia() {
        return Promise.resolve({
          getTracks() {
            return [];
          },
        });
      },
    },
    configurable: true,
  });
}

// happy-dom has no WebAudio API. The document gesture listeners registered by
// AudioPlayer.resumeAudioContext() can survive into another spec, so the moment something like
// user-interaction-unlock.spec dispatches an event, the listener tries to construct an AudioContext
// and dies with "is not a constructor". A minimal stub goes on globalThis and window.
if (typeof globalThis.AudioContext === 'undefined') {
  class FakeAudioParam {
    value = 1;
    setValueAtTime() {
      return this;
    }
    setTargetAtTime() {
      return this;
    }
  }
  class FakeGainNode {
    readonly gain = new FakeAudioParam();
    connect() {
      return this;
    }
    disconnect() {
      return this;
    }
  }
  class FakeMediaElementSource {
    connect() {
      return this;
    }
    disconnect() {
      return this;
    }
  }
  class FakeAudioContext {
    currentTime = 0;
    destination: object = {};
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createGain() {
      return new FakeGainNode();
    }
    createMediaElementSource() {
      return new FakeMediaElementSource();
    }
  }
  (globalThis as unknown as Record<string, unknown>)['AudioContext'] = FakeAudioContext;
  (globalThis as unknown as Record<string, unknown>)['webkitAudioContext'] = FakeAudioContext;
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>)['AudioContext'] = FakeAudioContext;
    (window as unknown as Record<string, unknown>)['webkitAudioContext'] = FakeAudioContext;
  }
}

// happy-dom's FileReader loses readAs* once zone.js patches it; rebuild on Blob API.
class FileReaderPolyfill {
  result: string | ArrayBuffer | null = null;
  onload: ((event: Partial<ProgressEvent>) => void) | null = null;
  onerror: ((event: Partial<ProgressEvent>) => void) | null = null;
  onabort: ((event: Partial<ProgressEvent>) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.(this.progressEvent());
      })
      .catch(() => this.onerror?.(this.progressEvent()));
  }

  readAsText(blob: Blob): void {
    blob
      .text()
      .then((text) => {
        this.result = text;
        this.onload?.(this.progressEvent());
      })
      .catch(() => this.onerror?.(this.progressEvent()));
  }

  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const bytes = Array.from(new Uint8Array(buffer));
        const base64 = btoa(bytes.map((b) => String.fromCharCode(b)).join(''));
        this.result = `data:${(blob as Blob & { type: string }).type};base64,${base64}`;
        this.onload?.(this.progressEvent());
      })
      .catch(() => this.onerror?.(this.progressEvent()));
  }

  private progressEvent(): Partial<ProgressEvent> {
    return { target: this } as unknown as Partial<ProgressEvent>;
  }
}
(globalThis as unknown as Record<string, unknown>)['FileReader'] = FileReaderPolyfill;

// happy-dom resolves relative URLs against http://localhost:3000, so an unmocked fetch
// (config.json / SkyWay backend / NTP) opens a real socket that rejects late as
// ECONNREFUSED and bleeds into unrelated specs. Disable network by default; specs that
// need fetch override this via vi.spyOn(globalThis, 'fetch') / vi.stubGlobal('fetch', ...).
(globalThis as unknown as Record<string, unknown>)['fetch'] = () =>
  Promise.reject(new Error('fetch is disabled in unit tests'));

// happy-dom refuses to fetch a script, and @angular/youtube-player sends for the iframe API the
// moment a player is rendered; the refusal surfaces as an unhandled DOMException in the run log.
// An API already in place is never sent for, and the player asks nothing of it without a videoId.
if (typeof (globalThis as unknown as Record<string, unknown>)['YT'] === 'undefined') {
  (globalThis as unknown as Record<string, unknown>)['YT'] = {
    Player: class Player {
      destroy() {}
      addEventListener() {}
      removeEventListener() {}
    },
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  };
}

type GlobalTestProviders = (Provider | EnvironmentProviders)[];

// The services every TestBed module is given reach most of the app, and loading them costs a file
// close to half a second. More than half the specs never build a module, so the spec about to run
// is read for the word first. A path that is not a spec source, as under the bundling `ng test`
// runner, gets them regardless.
function specUsesTestBed(): boolean {
  const testPath = expect.getState().testPath;
  if (!testPath?.endsWith('.spec.ts')) return true;
  try {
    return readFileSync(testPath, 'utf-8').includes('TestBed');
  } catch {
    return true;
  }
}

async function loadGlobalTestProviders(): Promise<GlobalTestProviders> {
  const [
    { ChatMessageService },
    { LoggerService },
    { TabletopService },
    { ContextMenuService },
    { ModalService },
    { PanelService },
    { AppConfigService },
    { provideTranslocoTesting },
  ] = await Promise.all([
    import('@axe/application/chat/chat-message.service'),
    import('@axe/application/logging/logger.service'),
    import('@axe/application/tabletop/tabletop.service'),
    import('@axe/application/ui/context-menu.service'),
    import('@axe/application/ui/modal.service'),
    import('@axe/application/ui/panel.service'),
    import('@axe/composition/app-config.service'),
    import('@axe/testing/transloco-testing'),
  ]);
  return [
    AppConfigService,
    ChatMessageService,
    ContextMenuService,
    // The service turns logging up to what the build calls for as it is made, which outside
    // production is everything. Made for a test, it leaves the level where the setup put it.
    {
      provide: LoggerService,
      useFactory: () => {
        const service = new LoggerService();
        Logger.setLevel(LogLevel.NONE);
        return service;
      },
    },
    ModalService,
    PanelService,
    TabletopService,
    ...provideTranslocoTesting(),
  ];
}

// The wrapper can outlive the file that made it, so it looks the providers up on every call
// rather than keeping the ones it was made with.
const GLOBAL_TEST_PROVIDERS_KEY = '__axeGlobalTestProviders__';

function globalTestProviders(): GlobalTestProviders {
  const providers = (globalThis as unknown as Record<string, GlobalTestProviders | null>)[GLOBAL_TEST_PROVIDERS_KEY];
  if (!providers) {
    throw new Error(
      `${expect.getState().testPath} builds a TestBed module without naming TestBed, so test-setup never loaded the providers every module is given.`
    );
  }
  return providers;
}

// Re-apply per beforeEach; the Angular test runner may reset the wrapper. Sentinel guards re-wrap.
const WRAPPER_SENTINEL = '__globalProviderWrapped__';

function applyConfigureTestingModuleWrapper(): void {
  if ((TestBed.configureTestingModule as unknown as Record<string, unknown>)[WRAPPER_SENTINEL]) return;
  const orig = TestBed.configureTestingModule.bind(TestBed) as (config: TestModuleMetadata) => typeof TestBed;
  const wrapped = (config: TestModuleMetadata) =>
    orig({
      ...config,
      providers: [...(config.providers ?? []), ...globalTestProviders()],
      schemas: [...(config.schemas ?? []), NO_ERRORS_SCHEMA],
    });
  (wrapped as unknown as Record<string, unknown>)[WRAPPER_SENTINEL] = true;
  TestBed.configureTestingModule = wrapped as typeof TestBed.configureTestingModule;
}

// Vitest runs setup once per test file; swallow the "already initialized" throw on re-entry.
try {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  /* already initialized */
}

// ObjectStore is a static singleton and every spec in a file shares it. Specs that count what
// they put in - the effect presets, a vote registered under a fixed identifier - then read the
// leftovers of the test before them, or fail to register at all because the identifier is taken.
// Empty it before every test rather than trusting each one to clean up after itself.
function emptyObjectStore(): void {
  const store = ObjectStore.instance;
  for (const object of store.getObjects()) store.delete(object, false);
  store.clearDeleteHistory();
}

// The cursor of whoever is reading is a static as well, and it decides what a role is allowed to
// see. A test that leaves a game master behind hands the next one a game master, which is how a
// toolbar meant for a player comes out missing. Nothing is anybody until a test says so.
function forgetMyCursor(): void {
  PeerCursor.myCursor = null!;
}

// How this seat looks at the table is intentionally persistent in the application, but a spec that
// asks for a flat screen must not leave the next one's otherwise ordinary table lying down. The
// same goes for what a seat shows: a spec that puts a toolbar away, folds one or hides the bars
// over the pieces writes that choice to the browser, and the file after it builds its services
// from whatever is left there.
function forgetSeatPreferences(): void {
  localStorage.removeItem(TABLETOP_DISPLAY_STORAGE_KEY);
  localStorage.removeItem(VIEW_MODE_STORAGE_KEY);
  localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
  localStorage.removeItem(WIDGET_VISIBILITY_STORAGE_KEY);
  localStorage.removeItem(TOOLBAR_FOLD_STORAGE_KEY);
  localStorage.removeItem(PIECE_OVERLAY_STORAGE_KEY);
}

beforeAll(async () => {
  (globalThis as unknown as Record<string, GlobalTestProviders | null>)[GLOBAL_TEST_PROVIDERS_KEY] = specUsesTestBed()
    ? await loadGlobalTestProviders()
    : null;
});

beforeEach(async () => {
  // A test that turns logging up, as the logger specs do, must not leave the next one printing.
  Logger.setLevel(LogLevel.NONE);
  emptyObjectStore();
  forgetMyCursor();
  forgetSeatPreferences();
  resetPeerContextProvider();
  await resolveComponentResources(resourceResolver as Parameters<typeof resolveComponentResources>[0]);
  applyConfigureTestingModuleWrapper();
});
