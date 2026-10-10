import { Injectable } from '@angular/core';
import { Logger, LogLevel } from '@axe/core/logging/logger';
import { environment } from '@env/environment';

export { LogLevel } from '@axe/core/logging/logger';

@Injectable()
export class LoggerService {
  constructor() {
    const level = environment.production ? LogLevel.WARN : LogLevel.DEBUG;
    Logger.setLevel(level);
  }

  /** Sets the lowest level that is written to the console, for the whole app. */
  setLevel(level: LogLevel): void {
    Logger.setLevel(level);
  }

  /** The lowest level currently written to the console. */
  getLevel(): LogLevel {
    return Logger.getLevel();
  }

  /** Writes a debugging message, which the production level leaves out. */
  debug(message: string, ...args: unknown[]): void {
    Logger.debug(message, ...args);
  }

  /** Writes an informational message, which the production level leaves out. */
  info(message: string, ...args: unknown[]): void {
    Logger.info(message, ...args);
  }

  /** Writes a warning, which is dropped only at the `ERROR` and `NONE` levels. */
  warn(message: string, ...args: unknown[]): void {
    Logger.warn(message, ...args);
  }

  /** Writes an error, which is kept at every level but `NONE`. */
  error(message: string, ...args: unknown[]): void {
    Logger.error(message, ...args);
  }
}
