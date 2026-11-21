import { ConsoleLogger, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * El `ConsoleLogger` de Nest con un timestamp inequívoco: ISO 8601 en
 * UTC (`2026-11-18T15:35:24.123Z`) en vez del `toLocaleString()` por defecto
 * (`11/18/2026, 10:35:24 AM`), que depende del locale y no dice la zona.
 * Conserva el resto del formato: pid, nivel y contexto.
 */
export class IsoConsoleLogger extends ConsoleLogger {
  protected getTimestamp(): string {
    return new Date().toISOString();
  }
}

/**
 * Junta un mensaje multilínea en una sola línea. Los errores de Prisma traen
 * saltos de línea y espacios en blanco, y sin esto la línea del log quedaría
 * vacía y el detalle, en líneas sin timestamp ni nivel.
 */
export function oneLine(message: string | undefined): string {
  return (message ?? '').replace(/\s+/g, ' ').trim() || '(sin detalle)';
}

const prismaLogger = new Logger('Prisma');

/** Sink de `setPrismaLogSink`: los errores y warnings de Prisma van al Logger de Nest. */
export function logPrisma(level: 'error' | 'warn', message: string) {
  prismaLogger[level](oneLine(message));
}

/**
 * Mensaje y stack de un error, para `logger.error(message, stack)`.
 * Nunca el objeto entero: el de Stripe o PayPal trae la respuesta cruda y sus
 * cabeceras.
 */
export function errorDetails(error: unknown): [string, string | undefined] {
  if (error instanceof Error) return [oneLine(error.message), error.stack];
  return [oneLine(typeof error === 'string' ? error : undefined), undefined];
}

const httpLogger = new Logger('HTTP');

/**
 * Una línea por request al terminar la respuesta: método, ruta, status y
 * duración. Registra la ruta sin la query string, para no volcar parámetros
 * al log.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.originalUrl.split('?')[0];
    httpLogger.log(
      `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`,
    );
  });
  next();
}
