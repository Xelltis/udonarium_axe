import { inject, Injectable } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { AppConfigService } from '@axe/composition/app-config.service';
import { initializeNetworkMessaging } from '@axe/core/network/network-messaging';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { loadIdentity } from '@axe/core/storage/identity-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { Alarm } from '@axe/domain/alarm/alarm';
import { createDefaultStatusAilments } from '@axe/domain/character/builtin-status-ailments';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { MarkDown } from '@axe/domain/data/mark-down';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { createDefaultEffectPresets } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { createDefaultCutIns } from '@axe/domain/media/builtin-cut-ins';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { normalizePeerRole } from '@axe/domain/peer/peer-role';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { VnStage } from '@axe/domain/visual-novel/vn-stage';
import { Vote } from '@axe/domain/vote/vote';
import { NgSelectConfig } from '@ng-select/ng-select';

const PREFETCH_IDLE_TIMEOUT_MS = 5000;
const PREFETCH_FALLBACK_DELAY_MS = 1500;

@Injectable({ providedIn: 'root' })
export class AppInitializationService {
  private readonly fileArchiver = inject(FileArchiver);
  private readonly appConfigService = inject(AppConfigService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly chatTabList = inject(ChatTabList);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly turnState = inject(TurnState);
  private readonly config = inject(Config);
  private readonly dataSummarySetting = inject(DataSummarySetting);
  private readonly statusAilmentCatalog = inject(StatusAilmentCatalog);
  private readonly ngSelectConfig = inject(NgSelectConfig);
  private readonly keyboardInset = inject(KeyboardInsetService);

  initialize(): void {
    initializeNetworkMessaging();
    this.fileArchiver.initialize();
    ImageSharingSystem.instance.initialize();
    AudioSharingSystem.instance.initialize();
    ObjectSynchronizer.instance.initialize();
    this.appConfigService.initialize();
    this.pointerDeviceService.initialize();
    this.keyboardInset.initialize();
    this.ngSelectConfig.appendTo = 'body';

    this.tableSelecter.initialize();
    this.turnState.initialize();
    this.chatTabList.initialize();
    this.config.initialize();
    this.dataSummarySetting.initialize();

    this.initializeDomainObjects();
    this.initializeChatTabs();
    this.initializeAudioPresets();
    this.initializeEffectPresets();
    this.initializeCutIns();
    this.initializeStatusAilments();
    this.initializePeerCursor();
  }

  private initializeEffectPresets(): void {
    createDefaultEffectPresets();
    // Register the container type up front so a dropped effect set can be read.
    void EffectPresetSet;
  }

  private initializeCutIns(): void {
    createDefaultCutIns(this.imageStorage);
  }

  private initializeStatusAilments(): void {
    createDefaultStatusAilments(this.statusAilmentCatalog);
  }

  private initializeDomainObjects(): void {
    const diceBot = new DiceBot('DiceBot');
    diceBot.initialize();
    prefetchWhenIdle(() => void DiceBot.ensureLoaded());

    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();

    const playlist = new Playlist('Playlist');
    playlist.initialize();

    const markdown = new MarkDown('markdown');
    markdown.initialize();

    const cutInLauncher = new CutInLauncher('CutInLauncher');
    cutInLauncher.initialize();

    const vote = new Vote('Vote');
    vote.initialize();

    const alarm = new Alarm('Alarm');
    alarm.initialize();

    const reloadCheck = new ReloadCheck('ReloadCheck');
    reloadCheck.initialize();

    const soundEffect = new SoundEffect('SoundEffect');
    soundEffect.initialize();

    const vnStage = new VnStage('VnStage');
    vnStage.initialize();
  }

  private initializeChatTabs(): void {
    this.chatTabList.addChatTab('メインタブ', 'MainTab');
    this.chatTabList.addChatTab('サブタブ', 'SubTab');
    this.chatTabList.ensureTickerTab();
    this.chatTabList.ensureSystemTab();
  }

  private initializeAudioPresets(): void {
    AudioPlayer.resumeAudioContext();

    const addHidden = (path: string): string => {
      const file = this.audioStorage.add(path);
      file.isHidden = true;
      AudioTag.create(file.identifier).tag = 'SE';
      return file.identifier;
    };

    type SoundKey = Exclude<keyof typeof PresetSound, 'prototype'>;
    const soundMap: Record<SoundKey, string> = {
      dicePick: './assets/sounds/soundeffect-lab/shoulder-touch1.mp3',
      dicePut: './assets/sounds/soundeffect-lab/book-stack1.mp3',
      diceRoll1: './assets/sounds/on-jin/spo_ge_saikoro_teburu01.mp3',
      diceRoll2: './assets/sounds/on-jin/spo_ge_saikoro_teburu02.mp3',
      coinFlip: './assets/sounds/on-jin/cointoss.mp3',
      damageSmall: './assets/sounds/soundeffect-lab/damage-small.mp3',
      damageMedium: './assets/sounds/soundeffect-lab/damage-medium.mp3',
      damageLarge: './assets/sounds/soundeffect-lab/damage-large.mp3',
      healSmall: './assets/sounds/soundeffect-lab/heal-small.mp3',
      healMedium: './assets/sounds/soundeffect-lab/heal-medium.mp3',
      healLarge: './assets/sounds/soundeffect-lab/heal-large.mp3',
      mechDamageSmall: './assets/sounds/otologic/mech-damage-small.mp3',
      mechDamageMedium: './assets/sounds/otologic/mech-damage-medium.mp3',
      mechDamageLarge: './assets/sounds/otologic/mech-damage-large.mp3',
      mechHealSmall: './assets/sounds/soundeffect-lab/mech-heal-small.mp3',
      mechHealMedium: './assets/sounds/soundeffect-lab/mech-heal-medium.mp3',
      mechHealLarge: './assets/sounds/soundeffect-lab/mech-heal-large.mp3',
      cardDraw: './assets/sounds/soundeffect-lab/card-turn-over1.mp3',
      cardPick: './assets/sounds/soundeffect-lab/shoulder-touch1.mp3',
      cardPut: './assets/sounds/soundeffect-lab/book-stack1.mp3',
      cardShuffle: './assets/sounds/soundeffect-lab/card-open1.mp3',
      piecePick: './assets/sounds/soundeffect-lab/shoulder-touch1.mp3',
      piecePut: './assets/sounds/soundeffect-lab/book-stack1.mp3',
      blockPick: './assets/sounds/tm2/tm2_pon002.wav',
      blockPut: './assets/sounds/tm2/tm2_pon002.wav',
      lock: './assets/sounds/tm2/tm2_switch001.wav',
      unlock: './assets/sounds/tm2/tm2_switch001.wav',
      sweep: './assets/sounds/tm2/tm2_swing003.wav',
      alarm: './assets/sounds/alarm/alarm.mp3',

      fireSmall: './assets/sounds/soundeffect-lab/fire-small.mp3',
      fireMedium: './assets/sounds/soundeffect-lab/fire-medium.mp3',
      fireLarge: './assets/sounds/soundeffect-lab/fire-large.mp3',
      explosionSmall: './assets/sounds/soundeffect-lab/explosion-small.mp3',
      explosionLarge: './assets/sounds/soundeffect-lab/explosion-large.mp3',
      explosionHuge: './assets/sounds/soundeffect-lab/explosion-huge.mp3',
      iceSmall: './assets/sounds/soundeffect-lab/ice-small.mp3',
      iceMedium: './assets/sounds/soundeffect-lab/ice-medium.mp3',
      iceLarge: './assets/sounds/soundeffect-lab/ice-large.mp3',
      thunderSmall: './assets/sounds/soundeffect-lab/thunder-small.mp3',
      thunderBolt: './assets/sounds/soundeffect-lab/thunder-bolt.mp3',
      thunderLarge: './assets/sounds/soundeffect-lab/thunder-large.mp3',
      windSmall: './assets/sounds/soundeffect-lab/wind-small.mp3',
      windLarge: './assets/sounds/soundeffect-lab/wind-large.mp3',
      earthUpheaval: './assets/sounds/soundeffect-lab/earth-upheaval.mp3',
      rockBreak: './assets/sounds/soundeffect-lab/rock-break.mp3',
      stoneHit: './assets/sounds/soundeffect-lab/stone-hit.mp3',
      cureSmall: './assets/sounds/soundeffect-lab/cure-small.mp3',
      cureMedium: './assets/sounds/soundeffect-lab/cure-medium.mp3',
      cureLarge: './assets/sounds/soundeffect-lab/cure-large.mp3',
      poison: './assets/sounds/soundeffect-lab/poison.mp3',
      buff: './assets/sounds/soundeffect-lab/buff.mp3',
      holy: './assets/sounds/soundeffect-lab/holy.mp3',
      dark: './assets/sounds/soundeffect-lab/dark.mp3',
      charge: './assets/sounds/soundeffect-lab/charge.mp3',
      slashSmall: './assets/sounds/soundeffect-lab/slash-small.mp3',
      slashCombo: './assets/sounds/soundeffect-lab/slash-combo.mp3',
      slashLarge: './assets/sounds/soundeffect-lab/slash-large.mp3',
      bowRelease: './assets/sounds/soundeffect-lab/bow-release.mp3',
      bowPierce: './assets/sounds/soundeffect-lab/bow-pierce.mp3',
      gunHandgun: './assets/sounds/soundeffect-lab/gun-handgun.mp3',
      gunRifle: './assets/sounds/soundeffect-lab/gun-rifle.mp3',
      breathFire: './assets/sounds/soundeffect-lab/breath-fire.mp3',
      breathIce: './assets/sounds/soundeffect-lab/breath-ice.mp3',
      breathPoison: './assets/sounds/soundeffect-lab/breath-poison.mp3',
      barrier: './assets/sounds/soundeffect-lab/barrier.mp3',
      reflect: './assets/sounds/soundeffect-lab/reflect.mp3',
      drain: './assets/sounds/soundeffect-lab/drain.mp3',
      warp: './assets/sounds/soundeffect-lab/warp.mp3',
      summon: './assets/sounds/soundeffect-lab/summon.mp3',
      gravity: './assets/sounds/soundeffect-lab/gravity.mp3',
      gravityLarge: './assets/sounds/soundeffect-lab/gravity-large.mp3',
      cleanse: './assets/sounds/soundeffect-lab/cleanse.mp3',
      qigong: './assets/sounds/soundeffect-lab/qigong.mp3',
      superArts: './assets/sounds/soundeffect-lab/super-arts.mp3',
      gunSmg: './assets/sounds/soundeffect-lab/gun-smg.mp3',
      gunMachinegun: './assets/sounds/soundeffect-lab/gun-machinegun.mp3',
      slashIai: './assets/sounds/soundeffect-lab/slash-iai.mp3',
      slashCharged: './assets/sounds/soundeffect-lab/slash-charged.mp3',
      breathWind: './assets/sounds/soundeffect-lab/breath-wind.mp3',
      bashSmall: './assets/sounds/soundeffect-lab/bash-small.mp3',
      bashMedium: './assets/sounds/soundeffect-lab/bash-medium.mp3',
      bashLarge: './assets/sounds/soundeffect-lab/bash-large.mp3',
      bashFinish: './assets/sounds/soundeffect-lab/bash-finish.mp3',
      statusSleep: './assets/sounds/soundeffect-lab/status-sleep.mp3',
      statusBind: './assets/sounds/soundeffect-lab/status-bind.mp3',
      statusCurse: './assets/sounds/soundeffect-lab/status-curse.mp3',
      statusPetrify: './assets/sounds/soundeffect-lab/status-petrify.mp3',
      statusCure: './assets/sounds/soundeffect-lab/status-cure.mp3',
      beamSmall: './assets/sounds/soundeffect-lab/beam-small.mp3',
      collapse: './assets/sounds/soundeffect-lab/collapse.mp3',
      sfShot: './assets/sounds/on-jin/lasergun.mp3',
      sfHit: './assets/sounds/on-jin/laser-hit.mp3',
      sfBeam: './assets/sounds/on-jin/laserbeam.mp3',
      holyBlade: './assets/sounds/soundeffect-lab/holy-blade.mp3',
      missileLaunch: './assets/sounds/soundeffect-lab/missile-launch.mp3',
      rocketLaunch: './assets/sounds/soundeffect-lab/rocket-launch.mp3',
      flashImpact: './assets/sounds/soundeffect-lab/flash-impact.mp3',
      chatPageTurnLong: './assets/sounds/otologic/chat-page-turn-long.mp3',
      chatPageTurnShort: './assets/sounds/otologic/chat-page-turn-short.mp3',
      chatBubble: './assets/sounds/otologic/chat-bubble.mp3',
      chatCyber: './assets/sounds/otologic/chat-cyber.mp3',
      chatNotify1: './assets/sounds/otologic/chat-notify1.mp3',
      chatNotify2: './assets/sounds/otologic/chat-notify2.mp3',
    };

    for (const key of Object.keys(soundMap) as SoundKey[]) {
      PresetSound[key] = addHidden(soundMap[key]);
    }
  }

  private initializePeerCursor(): void {
    const fileContext = ImageFile.createEmpty('none_icon').toContext();
    fileContext.url = './assets/images/avatar_default.png';
    const noneIconImage = this.imageStorage.add(fileContext);

    PeerCursor.createMyCursor();
    PeerCursor.myCursor.name = 'プレイヤー';
    PeerCursor.myCursor.imageIdentifier = noneIconImage.identifier;

    const storedIdentity = loadIdentity();
    if (storedIdentity) {
      PeerCursor.myCursor.reConnectPass = storedIdentity.reConnectPass;
      PeerCursor.myCursor.role = normalizePeerRole(storedIdentity.role);
    }
  }
}

function prefetchWhenIdle(load: () => void): void {
  const idleCallback = globalThis.requestIdleCallback;
  if (typeof idleCallback === 'function') idleCallback(load, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
  else setTimeout(load, PREFETCH_FALLBACK_DELAY_MS);
}
