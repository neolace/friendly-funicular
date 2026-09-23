/**
 * Minimal structured JSON logger. Every line is a single JSON object so that
 * CloudWatch Logs Insights and metric filters can query fields directly.
 *
 * Redaction is defence in depth: callers must never pass tokens, but any
 * field whose name looks sensitive is replaced before serialization.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY =
  /authorization|token|secret|password|cookie|jwt|credential|api[-_]?key/i;
const JWT_LIKE = /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (typeof value === 'string') return value.replace(JWT_LIKE, '[REDACTED]');
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(
  base: Record<string, unknown>,
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const log = (
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {},
  ): void => {
    const entry = redact({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...base,
      ...fields,
    });
    write(JSON.stringify(entry));
  };
  return {
    log,
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
  };
}
