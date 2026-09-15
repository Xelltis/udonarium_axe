import { confirmDialog } from '@axe/core/input/confirm-dialog';
import { SyncObject } from '@axe/core/sync/decorator';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

@SyncObject('reload-check')
export class ReloadCheck extends TabletopObject {
  private reloadOK: boolean = true;
  private isAnswer: boolean = false;

  /**
   * Gets ready for a file about to be loaded.
   *
   * While in a room, the next {@link answerCheck} asks the user before a room is overwritten; outside one,
   * loading goes ahead without asking.
   */
  reloadCheckStart(isOnline: boolean) {
    if (isOnline) {
      this.reloadOK = true;
      this.isAnswer = false;
    } else {
      this.reloadOK = true;
      this.isAnswer = true;
    }
  }

  /**
   * Whether a loaded room may overwrite the one in play, asking the user with a confirm dialog the first time.
   *
   * Later calls for the same load give the same answer without asking again.
   */
  answerCheck(): boolean {
    if (!this.isAnswer) {
      this.reloadOK = confirmDialog(
        'プレイ中にルーム根幹設定を含むデータが入力されました\nこのデータを本当に読み込んでいいですか？ 古いデータは上書きされます'
      );
      this.isAnswer = true;
    }
    return this.reloadOK;
  }

  /** The answer so far for the current load, without asking; true until the user declines. */
  isLoadOk(): boolean {
    return this.reloadOK;
  }
}
