import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { MoveInterruptService } from '@axe/application/tabletop/move-interrupt.service';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The band at the foot of the screen while a move waits for the room to step into it, drawn over
 * every panel rather than inside the table, so the few seconds it waits are not spent under one.
 *
 * The peer making the move is told how long it is waiting. A peer that answers for pieces that could
 * step in picks which of them do and where along the way, and which zone they pull the piece into
 * where pieces of more than one stop it, or lets the move by. A game master may settle the wait at
 * once, or let the move go on as though nobody had stepped in.
 */
@Component({
  selector: 'interrupt-prompt',
  templateUrl: './interrupt-prompt.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class InterruptPromptComponent {
  private readonly interrupts = inject(MoveInterruptService);
  private readonly rolePermission = inject(RolePermissionService);

  private readonly now = signal(Date.now());
  protected readonly zIndex = Z_TABLE_BANDS;

  protected readonly waiting = this.interrupts.waiting;
  protected readonly offer = this.interrupts.offer;
  protected readonly choice = this.interrupts.choice;

  /** How many whole seconds the move this peer declared has left to wait. */
  protected readonly secondsLeft = computed(() => {
    const waiting = this.waiting();
    return waiting ? Math.max(0, Math.ceil((waiting.deadline - this.now()) / 1000)) : 0;
  });

  /** Whether this reader may settle a wait, as a game master. */
  protected readonly mayRule = computed(() => {
    this.offer();
    this.waiting();
    return this.rolePermission.isGameMaster;
  });

  /** The ends of the slider for the point along the way, over the stretches the chosen pieces reach. */
  protected readonly range = computed(() => {
    const spans = this.choice()?.spans ?? [];
    if (spans.length < 1) return null;
    return { min: Math.floor(spans[0].from), max: Math.ceil(spans[spans.length - 1].to) };
  });

  constructor() {
    let timer: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const waiting = this.waiting();
      if (waiting && timer === null) {
        timer = setInterval(() => this.now.set(Date.now()), 250);
      } else if (!waiting && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      this.now.set(Date.now());
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer !== null) clearInterval(timer);
    });
  }

  protected isChosen(pieceId: string): boolean {
    return this.choice()?.pieces.includes(pieceId) ?? false;
  }

  protected toggle(pieceId: string): void {
    this.interrupts.togglePiece(pieceId);
  }

  protected chooseZone(zoneId: string): void {
    this.interrupts.setZone(zoneId);
  }

  protected slide(event: Event): void {
    this.interrupts.setAlong(Number((event.target as HTMLInputElement).value));
  }

  protected answer(): void {
    this.interrupts.answer();
  }

  protected pass(): void {
    this.interrupts.pass();
  }

  protected decideNow(): void {
    this.interrupts.decideNow();
  }

  protected drop(): void {
    this.interrupts.dropInterrupts();
  }
}
