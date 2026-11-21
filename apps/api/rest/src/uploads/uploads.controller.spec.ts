/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * El stub de `POST /attachments` registra metadatos (cuántos
 * archivos, `mimetype` y `size`) y nunca el contenido ni el nombre original.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { UploadsController, describeUploads } from './uploads.controller.js';
import type { UploadsService } from './uploads.service.js';

const file = {
  fieldname: 'attachment[]',
  originalname: 'zz-nombre-privado.txt',
  encoding: '7bit',
  mimetype: 'text/plain',
  size: 24,
  buffer: Buffer.from('zz-contenido-del-archivo'),
} as Express.Multer.File;

describe('UploadsController — log sin contenido', () => {
  afterEach(() => vi.restoreAllMocks());

  it('describeUploads da cuántos archivos, mimetype y size', () => {
    expect(describeUploads([file])).toBe('1 archivo(s): text/plain 24B');
    expect(describeUploads([])).toBe('0 archivo(s)');
    expect(describeUploads(undefined)).toBe('0 archivo(s)');
  });

  it('el WARN no lleva el buffer ni el nombre original; la respuesta no cambia', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const controller = new UploadsController({} as UploadsService);

    const response = controller.uploadFile([file]);

    expect(response[0].id).toBe('883');
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('text/plain 24B');
    expect(line).not.toContain('zz-nombre-privado');
    expect(line).not.toContain('zz-contenido-del-archivo');
    expect(line).not.toContain('7a 7a');
  });
});
