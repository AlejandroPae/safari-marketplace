/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * El stub de `POST /social-login-token` registra el proveedor y nunca el
 * `access_token`. Con el login de Google activo, ese token es el real del
 * usuario.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';

describe('AuthService.socialLogin — log sin secretos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registra un WARN con el provider y sin el access_token; la respuesta no cambia', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log');
    const service = new AuthService({} as JwtService);

    const response = await service.socialLogin({
      provider: 'google',
      access_token: 'zz-token-de-prueba',
    });

    expect(response).toMatchObject({ token: 'jwt token' });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('provider=google');
    expect(line).not.toContain('zz-token-de-prueba');
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('un provider con saltos de línea no parte la línea del log', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new AuthService({} as JwtService);

    await service.socialLogin({
      provider: 'google\n[Nest] falso',
      access_token: 'zz-token-de-prueba',
    });

    expect(String(warn.mock.calls[0][0])).not.toContain('\n');
  });
});
