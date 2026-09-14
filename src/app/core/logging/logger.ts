export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: '',
};

export class Logger {
  private static level: LogLevel = LogLevel.DEBUG;

  /**
   * Sets the lowest level that reaches the console; anything below it is
   * dropped, and NONE silences everything.
   */
  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  /** The lowest level currently written to the console. */
  static getLevel(): LogLevel {
    return Logger.level;
  }

  /** Writes a debug message to the console, only while the level is DEBUG. */
  static debug(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.debug(`[${LOG_LEVEL_LABELS[LogLevel.DEBUG]}] ${message}`, ...args);
    }
  }

  /** Writes an informational message to the console while the level is INFO or lower. */
  static info(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.info(`[${LOG_LEVEL_LABELS[LogLevel.INFO]}] ${message}`, ...args);
    }
  }

  /** Writes a warning to the console while the level is WARN or lower. */
  static warn(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(`[${LOG_LEVEL_LABELS[LogLevel.WARN]}] ${message}`, ...args);
    }
  }

  /** Writes an error to the console unless the level is NONE. */
  static error(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(`[${LOG_LEVEL_LABELS[LogLevel.ERROR]}] ${message}`, ...args);
    }
  }
}
