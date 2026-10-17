import { confirmDialog } from '@axe/core/input/confirm-dialog';
import { SyncObject } from '@axe/core/sync/decorator';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

@SyncObject('reload-check')
export class ReloadCheck extends TabletopObject {
  private reloadOK: boolean = true;
  private isAnswer: boolean = false;
  private isWithheldAnswer: boolean = false;

  /**
   * Gets ready for a file about to be loaded.
   *
   * While in a room, the next {@link answerCheck} asks the user before a room is overwritten; outside one,
   * loading goes ahead without asking.
   */
  reloadCheckStart(isOnline: boolean) {
    this.isWithheldAnswer = false;
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

  /**
   * Whether room data saved by somebody who saw some of it only in the shape a room server withholds
   * may be loaded, asking the user once for the current load, in or out of a room. Declining stops
   * the rest of the load, the chat beside it included.
   */
  answerWithheldCheck(): boolean {
    if (!this.isWithheldAnswer) {
      this.reloadOK =
        this.reloadOK &&
        confirmDialog(
          'このデータには、部屋のサーバーで伏せた形のまま受け取った物が入っています（GM以外の人の保存か、そうした物が残る卓でGMが取った保存です）。\n' +
            'GMだけや特定PLに絞ったメモ、表の見えないカード、ほかの人のダイスの目、シークレットダイスの中身、ほかの人どうしの秘話、見せないタブの発言は、欠けたり伏せたりしています。読み込むと、その形のまま部屋に広がります。\n' +
            '続きは、この確認が出ないGMの保存から読み込んでください。それでも読み込みますか？'
        );
      this.isWithheldAnswer = true;
      if (!this.reloadOK) this.isAnswer = true;
    }
    return this.reloadOK;
  }

  /** The answer so far for the current load, without asking; true until the user declines. */
  isLoadOk(): boolean {
    return this.reloadOK;
  }
}
