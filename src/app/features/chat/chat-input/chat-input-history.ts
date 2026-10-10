export class ChatInputHistory {
  private readonly lines: string[] = [];
  private cursor = -1;
  static readonly MAX = 1000;

  /**
   * Records a line that was sent, dropping the oldest past the limit, and returns browsing to the
   * fresh draft.
   */
  push(text: string): void {
    if (this.lines.length >= ChatInputHistory.MAX) this.lines.shift();
    this.lines.push(text);
    this.cursor = -1;
  }

  /**
   * Steps through the sent lines and returns the one landed on.
   *
   * A negative direction goes to older lines, starting from the newest. Stepping forward past the
   * newest returns an empty string, which stands for the blank draft.
   */
  navigate(direction: number): string {
    if (direction < 0 && this.cursor < 0) {
      this.cursor = this.lines.length - 1;
    } else if (direction > 0 && this.cursor >= this.lines.length - 1) {
      this.cursor = -1;
    } else {
      this.cursor += direction;
    }
    return this.cursor < 0 ? '' : this.lines[this.cursor];
  }
}
