import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { DEFAULT_GAME_CLOCK } from '@axe/domain/game-clock/game-clock';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameClockService', () => {
  let service: GameClockService;
  let notices: { kind: string; text: string }[];

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(GameClockService);
    notices = [];
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockImplementation((kind, text) => {
      notices.push({ kind, text });
      return null;
    });
  });

  afterEach(() => {
    Config.instance.gameClock = DEFAULT_GAME_CLOCK;
    Config.instance.gameClockSkies = [];
    vi.restoreAllMocks();
  });

  it('starts a room that never set a time at the morning of the first day', () => {
    expect(service.dayText()).toBe('1日目');
    expect(service.timeText()).toBe('朝');
  });

  it('moves on through the parts of the day into the next, and says so in the chat', () => {
    for (let step = 0; step < 4; step++) service.step(1);

    expect(service.dayText()).toBe('2日目');
    expect(service.timeText()).toBe('朝');
    expect(notices.at(-1)).toEqual({ kind: 'clock', text: '時間を進めました: 2日目 朝' });

    service.step(-1);
    expect(service.timeText()).toBe('夜');
    expect(notices.at(-1)?.text).toBe('時間を戻しました: 1日目 夜');
  });

  it('says nothing for a step back from the very start, which goes nowhere', () => {
    service.step(-1);

    expect(service.dayText()).toBe('1日目');
    expect(service.timeText()).toBe('朝');
    expect(notices).toEqual([]);
  });

  it('keeps quiet where the room does not want the time said', () => {
    service.setAnnounce(false);

    service.step(1);

    expect(service.timeText()).toBe('昼');
    expect(notices).toEqual([]);
  });

  it('tells the hour on a clock of 24 hours, moved on by the step chosen', () => {
    service.setMode('hours');
    service.setMinutes(23 * 60 + 30);
    service.setStep(60);

    service.step(1);

    expect(service.dayText()).toBe('2日目');
    expect(service.timeText()).toBe('00:30');
  });

  it('takes the names of the parts of a day the master writes, and the day written their way', () => {
    service.setPeriods('早朝、朝, 昼,,夕方,夜,深夜');
    service.setPeriod(5);
    service.setDayFormat('Day {n}');
    service.setDay(12);

    expect(service.periods()).toEqual(['早朝', '朝', '昼', '夕方', '夜', '深夜']);
    expect(service.timeText()).toBe('深夜');
    expect(service.dayText()).toBe('Day 12');
  });

  it('keeps the day written as long as it is read, and no longer', () => {
    service.setDayFormat(`${'x'.repeat(100)}{n}`);

    expect(service.clock().dayFormat).toBe('x'.repeat(40));
    const held = (Config.instance as unknown as { _gameClock: string })._gameClock;
    expect(JSON.parse(held).dayFormat).toBe('x'.repeat(40));
  });

  it('keeps the part of the day it is when the names go back to the language’s own', () => {
    service.setPeriods('早朝、朝, 昼,夕方,夜');
    service.setPeriod(3);

    service.setPeriods('');

    expect(service.periods()).toEqual(['朝', '昼', '夕', '夜']);
    expect(service.timeText()).toBe('夜');
  });

  it('lets nobody but the master move the clock or set it up', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    service.step(1);
    service.setDay(5);
    service.setMode('hours');
    service.setSky(0, 12);

    expect(Config.instance.gameClock).toEqual(DEFAULT_GAME_CLOCK);
    expect(Config.instance.gameClockSkies).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('puts the clock to a part of the day for a player pressing a switch the master set up', () => {
    PeerCursor.myCursor.role = PeerRole.Player;

    service.setPeriod(2);
    expect(service.timeText()).toBe('朝');

    service.setPeriod(2, { trusted: true });
    expect(service.timeText()).toBe('夕');
  });

  it('leaves a clock told by the hour alone for a switch, as it has no parts of the day', () => {
    service.setMode('hours');

    service.setPeriod(3, { trusted: true });

    expect(Config.instance.gameClock.period).toBe(0);
  });

  it('draws each part of the day at the hour the master chose for its sky, or lays it evenly again', () => {
    service.setPeriods('昼,夜');
    service.setSky(0, 12);
    service.setSky(1, 0);

    expect(service.skies()).toEqual([12, 0]);

    service.setSky(1, null);

    expect(service.skies()).toEqual([12]);
  });

  it('keeps each part’s sky with its name when the master names the parts anew', () => {
    service.setPeriods('昼,夜');
    service.setSky(0, 12);
    service.setSky(1, 0);

    service.setPeriods('朝,昼,夕,夜');

    expect(service.skies()).toEqual([null, 12, null, 0]);
  });

  it('leaves the skies as they were when the clock is stepped', () => {
    service.setPeriods('昼,夜');
    service.setSky(1, 0);

    service.step(1);

    expect(service.timeText()).toBe('夜');
    expect(service.skies()).toEqual([null, 0]);
  });
});
