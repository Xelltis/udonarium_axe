import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { isAppleTouchDevice } from '@axe/core/util/apple-touch';

export type RenderLiteSetting = 'auto' | 'on' | 'off';

const STORAGE_KEY = 'ui-render-lite';
const SETTING_ORDER: RenderLiteSetting[] = ['auto', 'on', 'off'];

/** What a browser tells about itself that bears on how much drawing it can take. */
export interface RenderCapability {
  userAgent: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
}

/**
 * Whether a browser left on auto is drawn the lighter way.
 *
 * Firefox pays far more than Chromium for blurring what lies behind a panel when a moving 3D
 * table lies there, and a machine with two cores or two gigabytes pays for it in any browser.
 * An iPhone or an iPad is not judged by its cores: WebKit reports two there whatever the chip,
 * and says nothing about memory, so the newest of them would be counted among the slowest.
 */
export function prefersLightRendering(capability: RenderCapability): boolean {
  if (/Firefox\//.test(capability.userAgent)) return true;
  if (isAppleTouchDevice(capability.userAgent, capability.maxTouchPoints)) return false;
  if ((capability.hardwareConcurrency ?? Infinity) <= 2) return true;
  return (capability.deviceMemory ?? Infinity) <= 2;
}

/**
 * Whether the table and the panels over it are drawn the lighter way.
 *
 * Lighter means no frosted glass behind panels and the ambience moved at about half its frame
 * rate. Auto decides by the browser and the machine; on and off are the reader's own choice.
 */
@Injectable({ providedIn: 'root' })
export class RenderLiteService {
  private readonly document = inject(DOCUMENT);
  private readonly suggested = prefersLightRendering(currentCapability());

  readonly setting = signal<RenderLiteSetting>(storedSetting());

  readonly active = computed<boolean>(() => {
    const setting = this.setting();
    if (setting === 'on') return true;
    if (setting === 'off') return false;
    return this.suggested;
  });

  constructor() {
    this.markDocument();
    effect(() => this.markDocument());
  }

  /** Moves the setting on to the next of auto, on and off, which is what the one button for it does. */
  cycle(): void {
    const index = SETTING_ORDER.indexOf(this.setting());
    this.set(SETTING_ORDER[(index + 1) % SETTING_ORDER.length]);
  }

  /** Only a choice is written down; what auto settles on is worked out afresh each visit. */
  set(setting: RenderLiteSetting): void {
    this.setting.set(setting);
    try {
      localStorage.setItem(STORAGE_KEY, setting);
    } catch {
      // Private browsing refuses the write; the setting still holds for this session.
    }
  }

  private markDocument(): void {
    this.document.documentElement.classList.toggle('render-lite', this.active());
  }
}

function currentCapability(): RenderCapability {
  if (typeof navigator === 'undefined') return { userAgent: '' };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

function storedSetting(): RenderLiteSetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SETTING_ORDER.includes(stored as RenderLiteSetting) ? (stored as RenderLiteSetting) : 'auto';
  } catch {
    return 'auto';
  }
}
