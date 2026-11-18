import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '../generated/prisma/client/client';
import { PrismaClient } from '../generated/prisma/client/client';

export type PrismaLogLevel = 'error' | 'warn';
export type PrismaLogSink = (level: PrismaLogLevel, message: string) => void;

// Por defecto, el mismo formato que imprimía Prisma con `log: ['error']`.
const defaultSink: PrismaLogSink = (level, message) => {
  console[level](`prisma:${level} ${message}`);
};
let logSink: PrismaLogSink = defaultSink;

/**
 * Redirige los errores y warnings de Prisma a otro logger (US-17). La API los
 * manda al Logger de Nest para que salgan con timestamp y nivel. Sin llamar a
 * esto, se imprimen como hasta ahora. `null` restaura el sink por defecto.
 */
export function setPrismaLogSink(sink: PrismaLogSink | null): void {
  logSink = sink ?? defaultSink;
}

const createClient = () => {
  // Fail-fast con mensaje claro: el driver adapter (@prisma/adapter-pg) NO aborta
  // si falta DATABASE_URL — un connectionString vacío degrada a un error críptico
  // de pg. Lanzar aquí lo hace obvio en el boot.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está configurada — revisa el .env (ver .env.example)'
    );
  }
  const adapter = new PrismaPg({ connectionString });
  // Mismos niveles que antes, pero `error` y `warn` salen como eventos para
  // pasar por `logSink`; `query` sigue yendo directo a stdout.
  const log: Prisma.LogDefinition[] =
    process.env.NODE_ENV === 'development'
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : [{ emit: 'event', level: 'error' }];
  const client = new PrismaClient({ adapter, log });
  client.$on('error', (e) => logSink('error', e.message));
  client.$on('warn', (e) => logSink('warn', e.message));
  return client;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

function getClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// Instanciación lazy vía Proxy: createClient() (que hace fail-fast si falta
// DATABASE_URL) NO corre al importar el módulo, sino en el primer acceso real
// a `prisma`. Así un consumidor que solo importa tipos no exige DATABASE_URL;
// el fail-fast salta cuando se va a tocar la DB de verdad.
export const prisma = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
