/**
 * Escrituras del staff de tienda sobre el pivote `shop_staff`.
 *
 * Los listados NO viven aquí: `listUsersWithRelations({ staffOf })` de
 * `users.repository.ts` los sirve con el mismo `include` y el mismo orden que
 * el resto de listados de usuarios.
 *
 * Reloj: el usuario nuevo y su fila del pivote fijan `createdAt` y
 * `updatedAt` desde `clock.ts`. Retirar staff borra filas del pivote, que no
 * tiene `updated_at`, y no toca `users`.
 *
 * Permiso: el permiso global `staff` refleja si el usuario es staff
 * de alguna tienda. El alta lo concede; retirar la última tienda lo quita.
 * El seed sigue la misma regla.
 */

import type { Prisma } from '../../generated/prisma/client/client';
import { prisma } from '../client';
import { now } from '../clock';
import { InvalidReferenceError } from '../domain-errors';
import { _toShopRecord, type ShopRecord } from '../records';
import { DuplicateEmailError } from './users.repository';

const STAFF_PERMISSION = 'staff';

export interface CreateShopStaffInput {
  name: string;
  email: string;
  /** Ya hasheado: hashear es de la API (precedente `createUser`). */
  passwordHash: string;
  shopId: number;
}

export interface CreateShopStaffResult {
  userId: number;
  /** `false` si el email ya era staff de esa tienda: no se tocó nada. */
  created: boolean;
}

const isUniqueViolation = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'P2002';

/**
 * Da de alta un staff: crea el usuario (permiso `customer`, como el registro)
 * y su fila en `shop_staff`, en una sola transacción.
 *
 * - Tienda inexistente: `InvalidReferenceError` (400).
 * - El email ya es staff de esa tienda: idempotente, `created: false`, no se
 *   cambia ni el nombre ni el password.
 * - El email ya es de otro usuario que no es staff de esa tienda:
 *   `DuplicateEmailError` (409). No se ata un usuario existente en silencio.
 *
 * El email se compara sin distinguir mayúsculas, como el login
 * (`findUserCredentialsByEmail`), y se guarda tal cual llega.
 */
export async function createShopStaff(
  input: CreateShopStaffInput
): Promise<CreateShopStaffResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: input.shopId },
        select: { id: true },
      });
      if (!shop) {
        throw new InvalidReferenceError('staff', 'shop_id', input.shopId);
      }

      const existing = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' } },
        select: {
          id: true,
          staffShops: {
            where: { shopId: input.shopId },
            select: { shopId: true },
          },
        },
      });
      if (existing) {
        if (existing.staffShops.length > 0) {
          // Idempotente, pero garantiza el permiso: un staff creado antes
          // de que se otorgara `staff` puede no tenerlo.
          await _grantStaffPermission(tx, existing.id);
          return { userId: Number(existing.id), created: false };
        }
        throw new DuplicateEmailError(input.email);
      }

      const at = now();
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: input.passwordHash,
          isActive: true,
          createdAt: at,
          updatedAt: at,
          // `staff` para que pueda entrar al admin.
          permissions: {
            create: [
              { permission: { connect: { name: 'customer' } } },
              { permission: { connect: { name: STAFF_PERMISSION } } },
            ],
          },
          staffShops: { create: { shopId: input.shopId, createdAt: at } },
        },
        select: { id: true },
      });
      return { userId: Number(user.id), created: true };
    });
  } catch (error) {
    // Dos altas simultáneas del mismo email: la segunda choca con el índice
    // único de expresión `lower(email)`, que Prisma no modela.
    if (isUniqueViolation(error)) throw new DuplicateEmailError(input.email);
    throw error;
  }
}

export interface RemoveShopStaffInput {
  userId: number;
  /** Acota a una tienda. Sin él, todas las que pase el filtro de `ownerId`. */
  shopId?: number;
  /** Solo tiendas de este dueño. Sin él (super admin), cualquier tienda. */
  ownerId?: number;
}

/**
 * Retira a un usuario del staff: borra sus filas de `shop_staff` en las
 * tiendas que pasan el filtro. El usuario NO se borra. Si se queda sin
 * ninguna tienda, pierde el permiso `staff` en la misma transacción
 *. Devuelve cuántas filas se borraron; 0 si no había nada que
 * retirar (el caller decide el 404).
 */
export async function removeShopStaff(
  input: RemoveShopStaffInput
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.shopStaff.deleteMany({
      where: {
        userId: input.userId,
        ...(input.shopId !== undefined && { shopId: input.shopId }),
        ...(input.ownerId !== undefined && {
          shop: { ownerId: input.ownerId },
        }),
      },
    });
    if (count > 0) {
      const remaining = await tx.shopStaff.count({
        where: { userId: input.userId },
      });
      if (remaining === 0) {
        await tx.permissionUser.deleteMany({
          where: {
            userId: input.userId,
            permission: { name: STAFF_PERMISSION },
          },
        });
      }
    }
    return count;
  });
}

/**
 * Tiendas de las que el usuario es staff (fila en `shop_staff`), por
 * `shop_id` ascendente. `/me` las suma a las suyas para que el admin le deje
 * entrar a cada una.
 */
export async function listStaffShops(userId: number): Promise<ShopRecord[]> {
  const rows = await prisma.shopStaff.findMany({
    where: { userId },
    include: { shop: true },
    orderBy: { shopId: 'asc' },
  });
  return rows.map((row) => _toShopRecord(row.shop));
}

/** Concede `staff` si no lo tiene. El catálogo de permisos es estático. */
async function _grantStaffPermission(
  tx: Prisma.TransactionClient,
  userId: bigint
): Promise<void> {
  const permission = await tx.permission.findUniqueOrThrow({
    where: { name: STAFF_PERMISSION },
    select: { id: true },
  });
  await tx.permissionUser.upsert({
    where: { userId_permissionId: { userId, permissionId: permission.id } },
    create: { userId, permissionId: permission.id },
    update: {},
  });
}
