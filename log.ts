/**
 * Structured logging: one JSON object per line, so hosting platforms (Render, Docker, journald)
 * can filter and search it. Never log tokens, device secrets, chat text or file contents.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;
export type Logger = (level: LogLevel, event: string, fields?: LogFields) => void;

const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isLevel = (value: string | undefined): value is LogLevel => value !== undefined && value in rank;

/** Writes JSON lines at or above `LOG_LEVEL` (default `info`); warnings and errors go to stderr. */
export function createLogger(env: Readonly<Record<string, string | undefined>> = process.env): Logger {
  const minimum = rank[isLevel(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info'];
  return (level, event, fields = {}) => {
    if (rank[level] < minimum) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
    if (rank[level] >= rank.warn) process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
}

export const silentLogger: Logger = () => undefined;
