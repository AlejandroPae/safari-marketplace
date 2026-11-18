/**
 * Cuerpo de `POST /staffs`: el `AddStaffInput` del admin
 * (`apps/admin/rest/src/types/index.ts`). Sin decoradores de validación,
 * como el resto de DTOs del proyecto: el servicio valida a mano (US-42).
 */
export class CreateStaffDto {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  shop_id?: unknown;
}
