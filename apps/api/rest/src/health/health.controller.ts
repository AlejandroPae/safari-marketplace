import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '#src/auth/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: 200 mientras el proceso responda. No toca la base. */
  @Get()
  liveness() {
    return this.healthService.liveness();
  }

  /** Readiness: 200 si Postgres responde; 503 con el chequeo caído si no. */
  @Get('ready')
  async readiness() {
    const report = await this.healthService.readiness();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
