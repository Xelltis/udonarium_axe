import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ChatPalette } from '@axe/domain/chat/chat-palette';

/**
 * Rewriting a piece's palettes, the chat palette and the remote controller's alike: the one check
 * every panel that edits a palette writes through. A palette is a piece's, so a seat that only
 * watches rewrites none, though it may still read and send from one.
 */
@Injectable({ providedIn: 'root' })
export class ChatPaletteWriteService {
  private readonly permission = inject(RolePermissionService);

  /** Whether this seat may rewrite a palette, which every role but a guest may. */
  mayWrite(): boolean {
    return this.permission.canEditTabletop();
  }

  /** Writes a palette's lines; nothing for a seat that may not. Whether they were written. */
  writeLines(palette: ChatPalette, text: string): boolean {
    if (!this.mayWrite()) return false;
    palette.setPalette(text);
    return true;
  }

  /**
   * Sets the dice system a palette rolls under, by id; nothing for a seat that may not, nor where the
   * palette rolls under it already. Whether it was set.
   */
  setDiceBot(palette: ChatPalette, id: string): boolean {
    if (!this.mayWrite() || palette.dicebot === id) return false;
    palette.dicebot = id;
    return true;
  }
}
