import type { AgentSeat, GmStatus } from '@axe/core/agent/agent-protocol';

import { TabLink } from '../tab-link';
import { TestTab, until } from '../test-tab';
import { TurnDesk, type TurnWait } from './turn-desk';

const GM: AgentSeat = { name: 'GM', role: 'gm', scope: 'write' };
const SETTINGS = { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 };
const LINE = { kind: 'chat', id: 'm1', tab: 'main', text: '扉を開けます', seat: 'プレイヤー1' };

describe('TurnDesk', () => {
  let link: TabLink;
  let desk: TurnDesk;
  let port: number;
  const tabs: TestTab[] = [];

  beforeEach(async () => {
    link = new TabLink({ port: 0, origins: ['http://localhost:4200'], bridge: '1.81.0', log: () => undefined });
    desk = new TurnDesk({ link, log: () => undefined, quietMs: 40, longestWaitMs: 150, attendedMs: 200 });
    port = await link.listen();
  });

  afterEach(async () => {
    desk.close();
    for (const tab of tabs.splice(0)) tab.close();
    await link.close();
  });

  async function connect(seat = GM): Promise<TestTab> {
    const tab = new TestTab(port);
    tabs.push(tab);
    await tab.welcome(seat);
    await until(() => link.current !== null);
    return tab;
  }

  function lastStatus(tab: TestTab): GmStatus | undefined {
    return tab.heard
      .flatMap((message) =>
        (message as { type?: string })?.type === 'gm.status' ? [(message as { status: GmStatus }).status] : []
      )
      .at(-1);
  }

  function start(tab: TestTab, set: { instructions?: string; notes?: string; fresh?: boolean } = {}): void {
    tab.say({
      type: 'gm.start',
      settings: SETTINGS,
      instructions: set.instructions ?? '',
      notes: set.notes ?? '',
      fresh: set.fresh ?? false,
    });
  }

  /** Takes the opening turn a new session is handed at once. */
  async function open(tab: TestTab, set: { instructions?: string; notes?: string } = {}): Promise<TurnWait> {
    start(tab, set);
    return desk.waitForTurn(2000);
  }

  it('tells a tab how the game master stands as it connects, and that no AI is there', async () => {
    const tab = await connect();
    await until(() => lastStatus(tab) !== undefined);

    expect(lastStatus(tab)).toEqual({
      run: 'off',
      model: '',
      spentUsd: 0,
      budgetUsd: 0,
      contextTokens: 0,
      kept: false,
      starts: 0,
      attended: false,
    });
  });

  it('answers an AI waiting before the game master is started that it is not, once its time is up', async () => {
    await connect();

    expect(await desk.waitForTurn(30)).toMatchObject({ turn: false, running: false });
  });

  it('starts only on the game master’s seat let to change the room', async () => {
    const tab = await connect({ ...GM, scope: 'read' });
    start(tab);

    await until(() => lastStatus(tab)?.starts === 1);
    expect(lastStatus(tab)).toMatchObject({ run: 'off' });
    expect(lastStatus(tab)?.problem).toContain("game master's seat");
  });

  it('opens a new session at once, with the instructions and the notebook, for the AI already waiting', async () => {
    const tab = await connect();
    const waiting = desk.waitForTurn(2000);
    start(tab, { instructions: '古城の探索', notes: '一行は門の前' });

    expect(await waiting).toEqual({
      turn: true,
      reasons: ['the person at your seat asked you to go on'],
      events: [],
      instructions: '古城の探索',
      notes: '一行は門の前',
    });
    await until(() => lastStatus(tab)?.run === 'thinking');
    expect(lastStatus(tab)).toMatchObject({ kept: true, attended: true });
  });

  it('hands over a turn once the room has gone quiet after a line that calls for one, with what happened', async () => {
    const tab = await connect();
    await open(tab);
    const waiting = desk.waitForTurn(2000);
    await until(() => lastStatus(tab)?.run === 'waiting');

    tab.say({ type: 'gm.events', events: [{ event: { kind: 'piece_moved', id: 'p1' } }] });
    tab.say({ type: 'gm.events', events: [{ event: LINE, wake: 'line' }] });

    expect(await waiting).toEqual({
      turn: true,
      reasons: ['a player spoke'],
      events: [{ kind: 'piece_moved', id: 'p1' }, LINE],
    });
  });

  it('answers that nothing called for a turn where only what calls for none happened', async () => {
    const tab = await connect();
    await open(tab);
    const waiting = desk.waitForTurn(120);
    tab.say({ type: 'gm.events', events: [{ event: { kind: 'piece_moved', id: 'p1' } }] });

    expect(await waiting).toMatchObject({ turn: false, running: true });
  });

  it('keeps a turn that fell due while the AI was away, and hands it over as the AI asks', async () => {
    const tab = await connect();
    await open(tab);
    tab.say({ type: 'gm.events', events: [{ event: LINE, wake: 'called' }] });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(await desk.waitForTurn(2000)).toMatchObject({
      turn: true,
      reasons: ['you were called by name or whispered to'],
      events: [LINE],
    });
  });

  it('hands on, in the order it was said, what the room said after a turn fell due with no AI waiting', async () => {
    const tab = await connect();
    await open(tab);
    tab.say({ type: 'gm.events', events: [{ event: LINE, wake: 'line' }] });
    tab.say({ type: 'gm.events', events: [{ event: { ...LINE, id: 'm2' }, wake: 'line' }] });

    // How long the room is waited on is the gathering's to keep, and its spec holds it to the
    // millisecond. Here nothing said is lost or put out of order, whether the second line came in
    // time for the first turn or makes the next.
    const told: unknown[] = [];
    while (told.length < 2) {
      const turn = await desk.waitForTurn(2000);
      if (!turn.turn) throw new Error('no turn was handed over');
      told.push(...turn.events);
    }
    expect(told).toEqual([LINE, { ...LINE, id: 'm2' }]);
  });

  it('tells each conversation the instructions and the notebook it has not had, and again one that begins anew', async () => {
    const tab = await connect();
    const first = {};
    const second = {};
    start(tab, { instructions: '古城の探索', notes: '門の前' });
    expect(await desk.waitForTurn(2000, undefined, first)).toMatchObject({
      instructions: '古城の探索',
      notes: '門の前',
    });

    tab.say({ type: 'gm.nudge', direction: '' });
    expect(await desk.waitForTurn(2000, undefined, first)).not.toHaveProperty('instructions');

    // The first goes quiet, as an AI app does whose conversation was left for a new one.
    tab.say({ type: 'gm.nudge', direction: '' });
    await until(() => desk.status().attended === false, 2000);
    expect(await desk.waitForTurn(2000, undefined, second)).toMatchObject({
      instructions: '古城の探索',
      notes: '門の前',
    });

    desk.beginAnew(first);
    tab.say({ type: 'gm.nudge', direction: '' });
    await until(() => desk.status().attended === false, 2000);
    expect(await desk.waitForTurn(2000, undefined, first)).toMatchObject({ instructions: '古城の探索' });
  });

  it('keeps the notebook from an AI while the game master is not started', async () => {
    const tab = await connect();

    expect(desk.writeNotes('勝手に書いたメモ')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(tab.heard.some((message) => (message as { type?: string })?.type === 'gm.notes')).toBe(false);
  });

  it('hands over at once what the person at the seat asks, with their word', async () => {
    const tab = await connect();
    await open(tab);
    const waiting = desk.waitForTurn(2000);
    await until(() => lastStatus(tab)?.run === 'waiting');
    tab.say({ type: 'gm.nudge', direction: '次の場面へ' });

    expect(await waiting).toMatchObject({ turn: true, direction: '次の場面へ' });
  });

  it('tells the instructions and the notebook again only once they have changed', async () => {
    const tab = await connect();
    await open(tab, { instructions: '古城の探索', notes: '' });
    tab.say({ type: 'gm.nudge', direction: '' });
    const second = await desk.waitForTurn(2000);
    expect(second).not.toHaveProperty('instructions');
    expect(second).not.toHaveProperty('notes');

    tab.say({ type: 'gm.update', settings: SETTINGS, instructions: '古城の探索。罠が多い', notes: '' });
    tab.say({ type: 'gm.nudge', direction: '' });
    const third = await desk.waitForTurn(2000);
    expect(third).toMatchObject({ turn: true, instructions: '古城の探索。罠が多い' });
    expect(third).not.toHaveProperty('notes');
  });

  it('tells the tab the notebook the AI wrote, and does not hand it back to the AI as news', async () => {
    const tab = await connect();
    await open(tab);

    expect(desk.writeNotes('門を越えた')).toEqual({ kept: 5 });
    await until(() => tab.heard.some((message) => (message as { type?: string })?.type === 'gm.notes'));
    expect(tab.heard).toContainEqual({ type: 'gm.notes', notes: '門を越えた' });

    tab.say({ type: 'gm.nudge', direction: '' });
    expect(await desk.waitForTurn(2000)).not.toHaveProperty('notes');
  });

  it('answers the AI waiting that the game master was stopped, and waits for the room when carried on', async () => {
    const tab = await connect();
    await open(tab);
    const waiting = desk.waitForTurn(2000);
    await until(() => lastStatus(tab)?.run === 'waiting');
    tab.say({ type: 'gm.stop' });

    expect(await waiting).toMatchObject({ turn: false, running: false });
    await until(() => lastStatus(tab)?.run === 'off');
    expect(lastStatus(tab)).toMatchObject({ halted: 'asked', kept: true });

    start(tab);
    expect(await desk.waitForTurn(120)).toMatchObject({ turn: false, running: true });
  });

  it('opens anew, telling the instructions again, when started afresh', async () => {
    const tab = await connect();
    await open(tab, { instructions: '古城の探索' });
    tab.say({ type: 'gm.stop' });
    // By the desk's own word: the tab's last word of it may still be from before it was started.
    await until(() => desk.status().run === 'off');

    start(tab, { instructions: '古城の探索', fresh: true });
    expect(await desk.waitForTurn(2000)).toMatchObject({ turn: true, instructions: '古城の探索' });
  });

  it('stops once the seat is no longer the game master’s', async () => {
    const tab = await connect();
    await open(tab);
    tab.say({ type: 'seat', seat: { ...GM, role: 'pl' } });

    await until(() => lastStatus(tab)?.run === 'off');
    expect(lastStatus(tab)).toMatchObject({ halted: 'seat' });
  });

  it('tells an AI of another conversation that somebody waits already, the one waiting kept in its place', async () => {
    const tab = await connect();
    const first = {};
    const waiting = desk.waitForTurn(2000, undefined, first);

    expect(await desk.waitForTurn(2000, undefined, {})).toMatchObject({ turn: false });

    start(tab, { instructions: '古城の探索' });
    expect(await waiting).toMatchObject({ turn: true, instructions: '古城の探索' });
  });

  it('keeps the turn with the AI taking it while it shows it is there, and lets another have the next once it does not', async () => {
    const tab = await connect();
    const first = {};
    const second = {};
    start(tab);
    expect(await desk.waitForTurn(2000, undefined, first)).toMatchObject({ turn: true });
    tab.say({ type: 'gm.nudge', direction: '' });

    desk.noteCall(first);
    desk.noteCall(second);
    expect(await desk.waitForTurn(2000, undefined, second)).toMatchObject({ turn: false });

    // The first makes no call of its own for a while; the second's own calls do not count as its.
    await new Promise((resolve) => setTimeout(resolve, 260));
    desk.noteCall(second);
    expect(await desk.waitForTurn(2000, undefined, second)).toMatchObject({ turn: true });
  });

  it('keeps a turn that fell due while the tab was away, and hands it over once the tab is back', async () => {
    const tab = await connect();
    await open(tab);
    const waiting = desk.waitForTurn(3000);
    await until(() => desk.status().run === 'waiting');
    tab.say({ type: 'gm.events', events: [{ event: LINE, wake: 'line' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    tab.close();
    await until(() => link.current === null);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(desk.status().run).toBe('waiting');

    await connect();
    expect(await waiting).toMatchObject({ turn: true, events: [LINE] });
  });

  it('hands the next turn to whoever asks once the conversation taking one has hung up', async () => {
    const tab = await connect();
    const first = {};
    start(tab);
    expect(await desk.waitForTurn(2000, undefined, first)).toMatchObject({ turn: true });
    tab.say({ type: 'gm.nudge', direction: '' });

    desk.leave(first);
    expect(await desk.waitForTurn(2000, undefined, {})).toMatchObject({ turn: true });
  });

  it('lets a later wait take the place of an earlier one', async () => {
    await connect();
    const earlier = desk.waitForTurn(2000);
    const later = desk.waitForTurn(30);

    expect(await earlier).toMatchObject({ turn: false });
    expect(await later).toMatchObject({ turn: false });
  });

  it('tells the tab once the AI has not called for a while, and again once it is back', async () => {
    const tab = await connect();
    await open(tab);
    desk.noteCall();
    await until(() => lastStatus(tab)?.attended === true);

    await until(() => desk.status().attended === false, 2000);
    expect(lastStatus(tab)).toMatchObject({ run: 'thinking' });

    desk.noteCall();
    await until(() => lastStatus(tab)?.attended === true);
  });
});
