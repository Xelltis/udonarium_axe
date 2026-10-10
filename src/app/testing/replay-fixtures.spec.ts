import { parseReplayArchive } from '@axe/domain/replay/replay-archive';
import { decodeReplayEvents, encodeReplayEvents } from '@axe/domain/replay/replay-codec';
import { ReplayEventKind } from '@axe/domain/replay/replay-event';
import { decodeReplayKeyframe, encodeReplayKeyframe } from '@axe/domain/replay/replay-keyframe';
import {
  buildLongReplayFixture,
  longReplayArchiveFiles,
  SHORT_SESSION,
  SIX_HOUR_SESSION,
} from '@axe/testing/replay-fixtures';
import { zipSync } from 'fflate';

describe('the made-up long recording', () => {
  const fixture = buildLongReplayFixture(SHORT_SESSION);

  it('comes out the same for the same options', () => {
    const again = buildLongReplayFixture(SHORT_SESSION);

    expect(again.events.length).toBe(fixture.events.length);
    expect(JSON.stringify(again.events.slice(-5))).toBe(JSON.stringify(fixture.events.slice(-5)));
  });

  it('numbers its events one after another in time order', () => {
    fixture.events.forEach((event, index) => {
      expect(event.seq).toBe(index + 1);
      if (index > 0) expect(event.t).toBeGreaterThanOrEqual(fixture.events[index - 1].t);
    });
  });

  it('reads back through the recorder’s own encoding', () => {
    const decoded = decodeReplayEvents(encodeReplayEvents(fixture.events));

    expect(decoded).toHaveLength(fixture.events.length);
    expect(decoded[10]).toEqual(fixture.events[10]);
  });

  it('keeps boards that read back and carry the chat so far, as format 2 did', () => {
    const last = fixture.keyframes[fixture.keyframes.length - 1];
    const objects = decodeReplayKeyframe(encodeReplayKeyframe(last.objects));

    expect(objects.filter((object) => object.aliasName === 'chat')).toHaveLength(SHORT_SESSION.chatLines);
  });

  it('brings a piece out one line per sync object, as format 2 did', () => {
    const creates = fixture.events.filter((event) => event.kind === ReplayEventKind.ObjectCreate);

    expect(creates.length).toBeGreaterThan(SHORT_SESSION.characters * 5);
  });

  it('records a hidden piece’s own changes as hidden and its values as public, as format 2 did', () => {
    const hiddenPiece = 'pc-0';
    const own = fixture.events.filter((event) => event.targetId === hiddenPiece);
    const values = fixture.events.filter((event) => event.targetId?.startsWith(`${hiddenPiece}-`));

    expect(own.every((event) => event.visibility.kind === 'gm-only')).toBe(true);
    expect(values.every((event) => event.visibility.kind === 'public')).toBe(true);
  });

  it('packs into an archive that reads back whole', async () => {
    const files = longReplayArchiveFiles(fixture);
    const content = await parseReplayArchive(files.map((file) => ({ name: file.name, blob: file })));

    expect(content?.events).toHaveLength(fixture.events.length);
    expect(content?.keyframes).toHaveLength(fixture.keyframes.length);
    expect(content?.manifest.formatVersion).toBe(2);
  });

  /**
   * Writes the six-hour session as an `.axe-replay.zip` for measuring the app by hand, and only
   * when asked to: `AXE_REPLAY_FIXTURE_OUT=/path/long.axe-replay.zip npx vitest run replay-fixtures`.
   */
  it.runIf(!!process.env['AXE_REPLAY_FIXTURE_OUT'])('writes the six-hour session when asked', async () => {
    const files = longReplayArchiveFiles(buildLongReplayFixture(SIX_HOUR_SESSION));
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) entries[file.name] = new Uint8Array(await file.arrayBuffer());
    const { writeFileSync } = await import('node:fs');

    writeFileSync(process.env['AXE_REPLAY_FIXTURE_OUT']!, zipSync(entries));
  });
});
