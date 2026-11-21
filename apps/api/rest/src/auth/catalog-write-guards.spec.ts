/// <reference types="vitest/globals" />
/*
 * La referencia de arriba es necesaria porque tsconfig.json fija
 * `types: ["node","express","multer"]` y deja fuera los globals de Vitest.
 */
/**
 * Guards de escritura de los catálogos globales: solo `super_admin`. Con
 * `ADMIN_OWNER_AND_STAFF`, el permiso `staff` heredaría el derecho a borrar ventas flash, autores y marcas de toda la plataforma.
 */
import 'reflect-metadata';
import { PERMISSIONS_KEY } from './decorators/permissions.decorator.js';
import { AuthorsController } from '#src/authors/authors.controller.js';
import { FlashSaleController } from '#src/flash-sale/flash-sale.controller.js';
import { ManufacturersController } from '#src/manufacturers/manufacturers.controller.js';

const guardOf = (controller: { prototype: object }, handler: string) =>
  Reflect.getMetadata(
    PERMISSIONS_KEY,
    (controller.prototype as Record<string, unknown>)[handler] as object,
  );

describe('guards de escritura de catálogo global', () => {
  it.each([
    [FlashSaleController, 'createFlashSale', ['super_admin']],
    [FlashSaleController, 'update', ['super_admin']],
    [FlashSaleController, 'deleteFlashSale', ['super_admin']],
    [AuthorsController, 'createAuthor', ['super_admin', 'store_owner']],
    [AuthorsController, 'update', ['super_admin']],
    [AuthorsController, 'remove', ['super_admin']],
    [ManufacturersController, 'createProduct', ['super_admin', 'store_owner']],
    [ManufacturersController, 'update', ['super_admin']],
    [ManufacturersController, 'remove', ['super_admin']],
  ])('%o.%s ⇒ %o', (controller, handler, expected) => {
    const guard = guardOf(controller, handler);
    expect(guard).toEqual(expected);
    expect(guard).not.toContain('staff');
  });
});
