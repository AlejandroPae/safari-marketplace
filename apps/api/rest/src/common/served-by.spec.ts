/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/** Tests del middleware X-Served-By (US-107). */
import { hostname } from 'node:os';
import express from 'express';
import request from 'supertest';
import { INSTANCE, servedBy } from './served-by.js';

describe('servedBy', () => {
  const app = express();
  app.use(servedBy);
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.get('/denied', (_req, res) => res.status(401).json({ statusCode: 401 }));

  it('INSTANCE es el hostname de la máquina (el id del contenedor)', () => {
    expect(INSTANCE).toBe(hostname());
  });

  it('pone X-Served-By en una respuesta normal sin tocar el cuerpo', async () => {
    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
    expect(res.headers['x-served-by']).toBe(INSTANCE);
    expect(res.body).toEqual({ ok: true });
  });

  it('también en un 401 y en un 404 sin controlador', async () => {
    const denied = await request(app).get('/denied');
    expect(denied.status).toBe(401);
    expect(denied.headers['x-served-by']).toBe(INSTANCE);

    const missing = await request(app).get('/no-existe');
    expect(missing.status).toBe(404);
    expect(missing.headers['x-served-by']).toBe(INSTANCE);
  });
});
