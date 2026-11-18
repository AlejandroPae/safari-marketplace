/**
 * Test de integración contra el Postgres real (sembrado por `just db-up`).
 * `setPrismaLogSink` (US-17): los errores que Prisma registra pasan por el
 * sink que pone el consumidor, en vez de imprimirse por su cuenta.
 */

import 'dotenv/config';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { type PrismaLogLevel, prisma, setPrismaLogSink } from './client';

afterEach(() => {
  setPrismaLogSink(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('setPrismaLogSink', () => {
  it('un error de consulta llega al sink y no a la consola', async () => {
    const received: Array<[PrismaLogLevel, string]> = [];
    const consoleError = vi.spyOn(console, 'error');
    setPrismaLogSink((level, message) => received.push([level, message]));

    await expect(
      prisma.$queryRawUnsafe('SELECT * FROM zz_tabla_que_no_existe')
    ).rejects.toThrow();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0][0]).toBe('error');
    expect(received.map(([, m]) => m).join('\n')).toContain(
      'zz_tabla_que_no_existe'
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('con null vuelve al formato por defecto, `prisma:error …` en consola', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    setPrismaLogSink(null);

    await expect(
      prisma.$queryRawUnsafe('SELECT * FROM zz_tabla_que_no_existe')
    ).rejects.toThrow();

    expect(consoleError).toHaveBeenCalled();
    expect(String(consoleError.mock.calls[0][0])).toMatch(/^prisma:error /);
  });
});
