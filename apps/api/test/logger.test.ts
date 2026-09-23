import { describe, expect, it } from 'vitest';
import { createLogger, redact } from '../src/utils/logger.js';

describe('redact', () => {
  it('redacts sensitive keys at any depth', () => {
    expect(
      redact({
        authorization: 'Bearer x',
        nested: { accessToken: 'abc', ok: 1, clientSecret: 's' },
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', ok: 1, clientSecret: '[REDACTED]' },
    });
  });

  it('redacts JWT-shaped strings in free text', () => {
    expect(redact('failed for eyJhbGciOi.eyJzdWIiOi.sig here')).toBe(
      'failed for [REDACTED] here',
    );
  });
});

describe('createLogger', () => {
  it('writes one JSON object per line with base fields', () => {
    const lines: string[] = [];
    const logger = createLogger({ service: 'api' }, (l) => lines.push(l));
    logger.info('hello', { route: '/x' });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      level: 'info',
      message: 'hello',
      service: 'api',
      route: '/x',
    });
    expect(Date.parse(entry.timestamp)).not.toBeNaN();
  });
});
