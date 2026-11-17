import { inject, Injectable } from '@angular/core';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { AgentChatTools } from '@axe/features/agent-tools/agent-chat-tools.service';
import { AgentGmTools } from '@axe/features/agent-tools/agent-gm-tools.service';
import { AgentPieceTools } from '@axe/features/agent-tools/agent-piece-tools.service';
import { AgentReadTools } from '@axe/features/agent-tools/agent-read-tools.service';

/**
 * Makes the tools an AI can call runnable, and starts keeping what happens in the room, once a link
 * asks for them: the tools are services of their own, made only then, so that nothing of them is
 * loaded or kept before a seat links an AI.
 */
@Injectable({ providedIn: 'root' })
export class AgentToolsSetup {
  private readonly runner = inject(AgentToolRunner);
  private readonly events = inject(AgentEventLog);
  private readonly read = inject(AgentReadTools);
  private readonly chat = inject(AgentChatTools);
  private readonly pieces = inject(AgentPieceTools);
  private readonly gm = inject(AgentGmTools);
  private done = false;

  /** Makes every tool runnable, once, and keeps what happens from now. */
  ensure(): void {
    this.events.start();
    if (this.done) return;
    this.done = true;
    this.runner.provide(this.read.handlers);
    this.runner.provide(this.chat.handlers);
    this.runner.provide(this.pieces.handlers);
    this.runner.provide(this.gm.handlers);
  }

  /** Stops keeping what happens. */
  release(): void {
    this.events.stop();
  }
}
