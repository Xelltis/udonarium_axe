import { TestBed } from '@angular/core/testing';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { AGENT_TOOLS } from '@axe/core/agent/agent-tools';
import { AgentToolsSetup } from '@axe/features/agent-tools/agent-tools-setup.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AgentToolsSetup', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  it('makes every tool the AI is told of runnable, and none it is not', () => {
    const runner = TestBed.inject(AgentToolRunner);
    const provided: string[] = [];
    const provide = runner.provide.bind(runner);
    vi.spyOn(runner, 'provide').mockImplementation((handlers) => {
      provided.push(...Object.keys(handlers));
      provide(handlers);
    });

    TestBed.inject(AgentToolsSetup).ensure();

    expect(provided.sort()).toEqual(AGENT_TOOLS.map((tool) => tool.name).sort());
    TestBed.inject(AgentToolsSetup).release();
  });

  it('starts keeping what happens as a link asks for the tools, and stops when it lets go', async () => {
    const setup = TestBed.inject(AgentToolsSetup);
    const events = TestBed.inject(AgentEventLog);
    const start = vi.spyOn(events, 'start');
    const stop = vi.spyOn(events, 'stop');

    setup.ensure();
    setup.ensure();
    setup.release();

    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
