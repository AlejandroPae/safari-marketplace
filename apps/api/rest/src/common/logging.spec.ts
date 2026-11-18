/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/** Tests unitarios del logging de la API (US-17). */
import { IsoConsoleLogger, oneLine } from './logging.js';

describe('IsoConsoleLogger', () => {
  it('cada línea lleva timestamp ISO 8601 en UTC y el nivel', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      new IsoConsoleLogger({ colors: false }).log('hola', 'Prueba');
      const line = String(write.mock.calls[0][0]);
      expect(line).toMatch(
        /^\[Nest\] \d+ +- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z +LOG \[Prueba\] hola\n$/,
      );
    } finally {
      write.mockRestore();
    }
  });
});

describe('oneLine', () => {
  it('junta un mensaje multilínea de Prisma en una sola línea', () => {
    expect(
      oneLine(
        '\nInvalid `prisma.$queryRaw()` invocation:\n\n\n  connect failed',
      ),
    ).toBe('Invalid `prisma.$queryRaw()` invocation: connect failed');
  });

  it('un mensaje vacío o ausente no deja la línea vacía', () => {
    expect(oneLine('  \n ')).toBe('(sin detalle)');
    expect(oneLine(undefined)).toBe('(sin detalle)');
  });
});
