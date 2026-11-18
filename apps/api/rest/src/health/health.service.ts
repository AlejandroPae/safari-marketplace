import { Injectable, Logger } from '@nestjs/common';
import { pingDatabase } from '@safari/db';
import { oneLine } from '#src/common/logging.js';

export interface DatabaseCheck {
  status: 'up' | 'down';
  latency_ms: number;
}

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: { database: DatabaseCheck };
}

/**
 * Liveness y readiness de la API (US-17).
 *
 * - Liveness no toca ninguna dependencia: si el proceso responde, está vivo.
 *   Así una base caída no hace reiniciar un proceso sano.
 * - Readiness hace un ping real a Postgres (`SELECT 1` con timeout, de
 *   `@safari/db`).
 *
 * El motivo del fallo de la base va al log, no a la respuesta: el endpoint es
 * público y el mensaje del driver puede traer host y puerto.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  liveness() {
    return { status: 'ok' as const };
  }

  async readiness(): Promise<ReadinessReport> {
    const ping = await pingDatabase();
    if (!ping.ok) {
      this.logger.warn(`Postgres no responde: ${oneLine(ping.error)}`);
    }
    return {
      status: ping.ok ? 'ok' : 'error',
      checks: {
        database: {
          status: ping.ok ? 'up' : 'down',
          latency_ms: ping.latencyMs,
        },
      },
    };
  }
}
