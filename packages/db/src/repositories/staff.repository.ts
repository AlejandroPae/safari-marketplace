/**
 * Escrituras del staff de tienda sobre el pivote `shop_staff` (US-42).
 *
 * Los listados NO viven aquí: `listUsersWithRelations({ staffOf })` de
 * `users.repository.ts` los sirve con el mismo `include` y el mismo orden que
 * el resto de listados de usuarios.
 *
 * Reloj (US-32): el usuario nuevo y su fila del pivote fijan `createdAt` y
 * `updatedAt` desde `clock.ts`. Retirar staff borra filas del pivote, que no
 * tiene `updated_at`, y no toca `users`.
 */

import { prisma } from '../client';
import { now } from '../clock';
import { InvalidReferenceError } from '../domain-errors';
import { DuplicateEmailError } from './users.repository';

export interface CreateShopStaffInput {
  name: string;
  email: string;
  /** Ya hasheado: hashear es de la API (precedente `createUser`, US-22). */
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
          permissions: {
            create: [{ permission: { connect: { name: 'customer' } } }],
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
 * tiendas que pasan el filtro. El usuario NO se borra. Devuelve cuántas
 * filas se borraron; 0 si no había nada que retirar (el caller decide el
 * 404).
 */
export async function removeShopStaff(
  input: RemoveShopStaffInput
): Promise<number> {
  const { count } = await prisma.shopStaff.deleteMany({
    where: {
      userId: input.userId,
      ...(input.shopId !== undefined && { shopId: input.shopId }),
      ...(input.ownerId !== undefined && {
        shop: { ownerId: input.ownerId },
      }),
    },
  });
  return count;
}
