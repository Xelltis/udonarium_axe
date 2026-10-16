import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VnStage } from '@axe/domain/visual-novel/vn-stage';
import { VisualNovelDirectorService } from '@axe/features/visual-novel/visual-novel-director.service';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisualNovelDirectorService', () => {
  let director: VisualNovelDirectorService;
  let playback: VisualNovelPlaybackService;
  let objectChange: ObjectChangeService;
  let stage: VnStage;
  let tab: ChatTab;
  let nextTimestamp = 1000;

  function addMessage(text: string): void {
    tab.addMessage({ from: Network.peerContext.userId, name: 'アリス', text, timestamp: nextTimestamp++ });
  }

  function notifyStage(): void {
    objectChange.notifyChanged(stage.identifier);
    TestBed.tick();
    TestBed.tick();
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    stage = ObjectStore.instance.get<VnStage>('VnStage') ?? new VnStage('VnStage');
    stage.initialize();
    stage.stopDirecting();
    tab = ChatTabList.instance.addChatTab('テストタブ');
    objectChange = TestBed.inject(ObjectChangeService);
    playback = TestBed.inject(VisualNovelPlaybackService);
    director = TestBed.inject(VisualNovelDirectorService);
    playback.setChatTab(tab.identifier);
    playback.attach();
    TestBed.tick();
  });

  afterEach(() => {
    playback.detach();
    PeerCursor.myCursor.role = PeerRole.Player;
    stage.stopDirecting();
    tab?.destroy();
  });

  it('counts a screening as over once its director is made a player, freeing whoever followed it', () => {
    const other = new PeerCursor();
    other.peerId = 'other-peer';
    other.role = PeerRole.GameMaster;
    other.initialize();
    stage.startDirecting('other-peer');
    notifyStage();
    expect(director.isFollowing()).toBe(true);

    other.role = PeerRole.Player;
    objectChange.notifyChanged(other.identifier);
    TestBed.tick();

    expect(director.isDirected()).toBe(false);
    expect(director.isFollowing()).toBe(false);
    other.destroy();
  });

  it('is ended on the stage by a game master who sees its director made a player, not to start again', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
    const other = new PeerCursor();
    other.peerId = 'other-peer';
    other.role = PeerRole.GameMaster;
    other.initialize();
    stage.startDirecting('other-peer');
    notifyStage();

    other.role = PeerRole.Player;
    objectChange.notifyChanged(other.identifier);
    TestBed.tick();
    expect(stage.isDirected).toBe(false);

    other.role = PeerRole.GameMaster;
    objectChange.notifyChanged(other.identifier);
    notifyStage();
    expect(director.isDirected()).toBe(false);
    other.destroy();
  });

  it('starts with the screening off', () => {
    expect(director.isDirected()).toBe(false);
    expect(director.isDirector()).toBe(false);
    expect(director.isFollowing()).toBe(false);
  });

  it('lets nobody but the game master start it', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);

    director.toggleDirecting();

    expect(stage.isDirected).toBe(false);
  });

  it('lets the game master start and end it', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);

    director.toggleDirecting();
    notifyStage();
    expect(director.isDirected()).toBe(true);
    expect(director.isDirector()).toBe(true);

    director.toggleDirecting();
    notifyStage();
    expect(director.isDirected()).toBe(false);
  });

  it('writes where the game master is looking onto the shared object', () => {
    addMessage('一幕');
    addMessage('二幕');
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
    director.toggleDirecting();
    notifyStage();

    playback.jumpTo(0);
    TestBed.tick();

    expect(stage.playheadIdentifier).toBe(playback.messages()[0].identifier);
    expect(stage.playheadTabIdentifier).toBe(tab.identifier);
  });

  it('moves a following player to that view and leaves them where they are once they stop', () => {
    addMessage('一幕');
    addMessage('二幕');
    addMessage('三幕');
    stage.startDirecting('other-peer');
    notifyStage();
    expect(director.isFollowing()).toBe(true);

    stage.setPlayhead(tab.identifier, playback.messages()[0].identifier);
    notifyStage();
    expect(playback.currentIndex()).toBe(0);

    director.leaveFollowing();
    expect(director.isDetached()).toBe(true);
    stage.setPlayhead(tab.identifier, playback.messages()[1].identifier);
    notifyStage();
    expect(playback.currentIndex()).toBe(0);

    director.rejoinFollowing();
    TestBed.tick();
    expect(playback.currentIndex()).toBe(1);
  });

  it('follows no player into a tab they may not read, leaving them on their own', () => {
    addMessage('一幕');
    const closed = ChatTabList.instance.addChatTab('GM用');
    closed.plCanView = false;
    closed.addMessage({ from: 'gm', name: 'GM', text: '伏せた話', timestamp: nextTimestamp++ });
    try {
      stage.startDirecting('other-peer');
      notifyStage();

      stage.setPlayhead(closed.identifier, closed.chatMessages[0].identifier);
      notifyStage();

      expect(playback.chatTabIdentifier()).toBe(tab.identifier);
    } finally {
      closed.destroy();
    }
  });

  it('stops running the screening for a game master made a player or a guest meanwhile', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    stage.startDirecting(getMyPeerId());
    notifyStage();
    expect(director.isDirector()).toBe(true);

    PeerCursor.myCursor.role = PeerRole.Guest;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();

    expect(director.isDirector()).toBe(false);
  });

  it('puts everybody back to following once it ends', () => {
    stage.startDirecting('other-peer');
    notifyStage();
    director.leaveFollowing();
    expect(director.following()).toBe(false);

    stage.stopDirecting();
    notifyStage();

    expect(director.following()).toBe(true);
    expect(getMyPeerId().length).toBeGreaterThan(0);
  });
});
