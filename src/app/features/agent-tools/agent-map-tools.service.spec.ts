import { TestBed } from '@angular/core/testing';
import { PartyService } from '@axe/application/party/party.service';
import {
  type GeneratedMap,
  MapGenerationService,
} from '@axe/application/tabletop/map-generation/map-generation.service';
import type { MapSettings } from '@axe/application/tabletop/map-generation/map-settings';
import { selectGameTable$ } from '@axe/core/event/domain-events';
import type { Party } from '@axe/domain/party/party';
import type { GameTable } from '@axe/domain/tabletop/game-table';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { AgentMapTools } from '@axe/features/agent-tools/agent-map-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const signal = new AbortController().signal;

describe('AgentMapTools', () => {
  let tools: AgentMapTools;
  let build: ReturnType<typeof vi.spyOn>;
  let discard: ReturnType<typeof vi.spyOn>;
  let made = 0;

  function call(args: Record<string, unknown>): Promise<unknown> {
    return Promise.resolve(tools.handlers['generate_map'](args, { signal }));
  }

  function mapOf(): GeneratedMap {
    made += 1;
    return {
      table: { identifier: `table-${made}`, name: `洞窟${made}` } as GameTable,
      floorImage: '',
      summary: 'notes',
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const maps = TestBed.inject(MapGenerationService);
    build = vi.spyOn(maps, 'build').mockImplementation(async () => mapOf());
    discard = vi.spyOn(maps, 'discard').mockImplementation(() => undefined);
    tools = TestBed.inject(AgentMapTools);
  });

  it('makes the map the panel would from the same settings, each left out as the panel starts on it', async () => {
    const answer = await call({ kind: 'field', atmosphere: 'village', size: 30, grid: 'hex_vertical', seed: 42 });

    const [settings, options] = build.mock.calls[0] as [MapSettings, { name: string }];
    expect(settings).toMatchObject({
      kind: 'field',
      fieldAtmosphere: 'village',
      fieldSize: 30,
      gridType: GridType.HEX_VERTICAL,
      seed: 42,
      atmosphere: 'stoneDungeon',
      roomCount: 8,
    });
    expect(options.name.length).toBeGreaterThan(0);
    expect(answer).toMatchObject({ table: { name: '洞窟1' }, seed: 42, switched: true, summary: 'notes' });
  });

  it('answers an atmosphere or a season it does not know with those it does', async () => {
    await expect(call({ kind: 'dungeon', atmosphere: 'village' })).rejects.toThrow(/stoneDungeon/);
    await expect(call({ kind: 'field', season: 'monsoon' })).rejects.toThrow(/spring, summer, autumn, winter/);
    expect(build).not.toHaveBeenCalled();
  });

  it("takes away only the map this seat's AI made last, and switches to the new one unless told not to", async () => {
    const switched: string[] = [];
    const off = selectGameTable$.subscribe((event) => switched.push(event.identifier));

    await call({ kind: 'dungeon' });
    await call({ kind: 'dungeon', replace_previous: true, switch_to: false });
    off();

    expect(discard).toHaveBeenCalledOnce();
    expect((discard.mock.calls[0][0] as GeneratedMap).table.identifier).toBe(`table-${made - 1}`);
    expect(switched).toEqual([`table-${made - 1}`]);
  });

  it('stands the party it names at the way in, and refuses a map too large', async () => {
    vi.spyOn(TestBed.inject(PartyService), 'parties').mockReturnValue([{ identifier: 'p1', name: '一行' } as Party]);
    build.mockResolvedValueOnce(null);

    await expect(call({ kind: 'dungeon', party: '一行' })).rejects.toThrow(/more terrain than a table may hold/);
    expect((build.mock.calls[0][1] as { musterParty: string }).musterParty).toBe('p1');
  });
});
