import '@angular/compiler';

import { NO_ERRORS_SCHEMA } from '@angular/core';
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

import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { LoggerService } from '@axe/application/logging/logger.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY } from '@axe/application/ui/tabletop-display-settings.service';
import { AppConfigService } from '@axe/composition/app-config.service';
import { provideTranslocoTesting } from '@axe/testing/transloco-testing';

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

// happy-dom has no WebAudio API. The document mousedown / touchstart listeners registered by
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

const GLOBAL_TEST_PROVIDERS = [
  AppConfigService,
  ChatMessageService,
  ContextMenuService,
  LoggerService,
  ModalService,
  PanelService,
  TabletopService,
  ...provideTranslocoTesting(),
];

// Re-apply per beforeEach; the Angular test runner may reset the wrapper. Sentinel guards re-wrap.
const WRAPPER_SENTINEL = '__globalProviderWrapped__';

function applyConfigureTestingModuleWrapper(): void {
  if ((TestBed.configureTestingModule as unknown as Record<string, unknown>)[WRAPPER_SENTINEL]) return;
  const orig = TestBed.configureTestingModule.bind(TestBed) as (config: TestModuleMetadata) => typeof TestBed;
  const wrapped = (config: TestModuleMetadata) =>
    orig({
      ...config,
      providers: [...(config.providers ?? []), ...GLOBAL_TEST_PROVIDERS],
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

// Tabletop display preferences are intentionally persistent in the application, but a spec that
// enables them must not turn the next spec's otherwise ordinary table into a flat display.
function forgetTabletopDisplaySettings(): void {
  localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
}

beforeEach(async () => {
  emptyObjectStore();
  forgetMyCursor();
  forgetTabletopDisplaySettings();
  resetPeerContextProvider();
  await resolveComponentResources(resourceResolver as Parameters<typeof resolveComponentResources>[0]);
  applyConfigureTestingModuleWrapper();
});
