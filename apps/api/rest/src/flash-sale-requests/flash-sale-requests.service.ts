import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createFlashSaleRequest,
  deleteFlashSaleRequest,
  findFlashSaleRequestById,
  findShopOwnerById,
  getUserFriendlyMessage,
  isPrismaConnectionError,
  isShopStaff,
  listFlashSaleRequestProducts,
  listFlashSaleRequests,
  resolveFlashSaleRequestShop,
  updateFlashSaleRequest,
  type FlashSaleRequestRecord,
  type ProductRecord,
  type UpdateFlashSaleRequestInput,
} from '@safari/db';
import type { CurrentUserPayload } from '#src/auth/decorators/current-user.decorator.js';
import { toWriteHttpException } from '#src/common/errors/domain-error.mapper.js';
import { paginate } from '#src/common/pagination/paginate.js';
import { parseSearch } from '#src/common/search/parse-search.js';
import { toFlashSaleDto } from '#src/flash-sale/flash-sale.service.js';
import { toProductDto } from '#src/products/product-dto.mapper.js';
import {
  FlashSaleRequestBodyDto,
  GetFlashSaleRequestsDto,
} from './dto/flash-sale-request.dto.js';

/**
 * Solicitud → claves en el orden del tipo del admin
 * (`FlashSaleProductsRequest`), más `shop_id` y `language`. `request_status`
 * es el booleano que pinta el admin: `status === 'approved'` (DA-5).
 * `deleted_at` es constante: no hay borrado lógico. El detalle añade
 * `products` (el mismo array), que es lo que precarga el formulario de
 * edición (`initialValues.products`).
 */
function toRequestDto(
  record: FlashSaleRequestRecord,
  { detail = false }: { detail?: boolean } = {},
): Record<string, unknown> {
  const products = record.products.map(toProductDto);
  return {
    id: record.id,
    title: record.title,
    flash_sale_id: record.flashSaleId,
    shop_id: record.shopId,
    requested_product_ids: products,
    request_status: record.status === 'approved',
    note: record.note,
    language: record.language,
    deleted_at: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    flash_sale: toFlashSaleDto(record.flashSale),
    ...(detail && { products }),
  };
}

function readError(error: unknown): never {
  if (isPrismaConnectionError(error)) {
    throw new ServiceUnavailableException(getUserFriendlyMessage(error));
  }
  throw new InternalServerErrorException(getUserFriendlyMessage(error));
}

/** Entero positivo seguro, o `null` (guarda de US-31 antes del driver). */
function toId(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

function isSuperAdmin(user: CurrentUserPayload): boolean {
  return user.permissions.includes('super_admin');
}

/** `undefined` para el super admin (ve todas); el id del usuario si no. */
function viewerOf(user: CurrentUserPayload): number | undefined {
  return isSuperAdmin(user) ? undefined : user.sub;
}

function notFound(id: unknown): NotFoundException {
  return new NotFoundException(
    `No existe una solicitud de venta flash con id ${String(id)}.`,
  );
}

/** Lista de ids del cuerpo. Ausente ⇒ `undefined`; mal formada ⇒ 400. */
function toProductIds(raw: unknown): number[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new BadRequestException(
      '`requested_product_ids` debe ser una lista de ids.',
    );
  }
  return raw.map((value) => {
    const id = toId(value);
    if (id === null) {
      throw new BadRequestException(
        `\`requested_product_ids\` trae un id inválido: \`${String(value)}\`.`,
      );
    }
    return id;
  });
}

/** Campos editables; una clave ausente no se toca. */
function toWriteInput(
  body: FlashSaleRequestBodyDto,
): UpdateFlashSaleRequestInput {
  let flashSaleId: number | undefined;
  if (body.flash_sale_id !== undefined) {
    const id = toId(body.flash_sale_id);
    if (id === null) {
      throw new BadRequestException(
        `\`flash_sale_id\` no es un id válido: \`${String(body.flash_sale_id)}\`.`,
      );
    }
    flashSaleId = id;
  }
  const productIds = toProductIds(body.requested_product_ids);
  return {
    ...(body.title !== undefined && { title: body.title }),
    ...(flashSaleId !== undefined && { flashSaleId }),
    ...(body.note !== undefined && { note: body.note }),
    ...(body.language !== undefined && { language: body.language }),
    ...(productIds !== undefined && { productIds }),
  };
}

@Injectable()
export class FlashSaleRequestsService {
  /**
   * Dueño de la tienda o su staff (precedente `products.service.ts`, US-66).
   * El super admin no se consulta.
   */
  private async assertShopAccess(
    user: CurrentUserPayload,
    shopId: number,
  ): Promise<void> {
    if (isSuperAdmin(user)) return;
    const ownerId = await findShopOwnerById(shopId);
    if (ownerId !== user.sub && !(await isShopStaff(user.sub, shopId))) {
      throw new ForbiddenException(
        `No tienes permisos sobre la tienda ${shopId}.`,
      );
    }
  }

  /**
   * Paginador en `id DESC`. `search=title:X` es ILIKE. `shop_id` llega
   * suelto o en `search`; para quien no es super admin, una tienda ajena
   * da 403 y, sin `shop_id`, solo ve las de sus tiendas.
   */
  async findAll(query: GetFlashSaleRequestsDto, user: CurrentUserPayload) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const tokens = parseSearch(query.search);
    const rawShop = query.shop_id ?? tokens.shop_id;
    let shopId: number | undefined;
    if (rawShop !== undefined && rawShop !== '') {
      const id = toId(rawShop);
      if (id === null) {
        throw new BadRequestException(
          `\`shop_id\` no es válido: \`${rawShop}\`.`,
        );
      }
      shopId = id;
      await this.assertShopAccess(user, shopId);
    }

    let result: { items: FlashSaleRequestRecord[]; total: number };
    try {
      result = await listFlashSaleRequests({
        title: tokens.title || undefined,
        shopId,
        viewerId: viewerOf(user),
        page,
        limit,
      });
    } catch (error) {
      readError(error);
    }

    const url = `/vendor-requests-for-flash-sale?search=${query.search}&limit=${limit}`;
    const data = result.items.map((record) => toRequestDto(record));
    return { data, ...paginate(result.total, page, limit, data.length, url) };
  }

  /** Con la venta y los productos; inexistente o de una tienda ajena ⇒ 404. */
  async findOne(rawId: string, user: CurrentUserPayload) {
    const id = toId(rawId);
    if (id === null) throw notFound(rawId);

    let record: FlashSaleRequestRecord | null;
    try {
      record = await findFlashSaleRequestById(id, { viewerId: viewerOf(user) });
    } catch (error) {
      readError(error);
    }
    if (!record) throw notFound(id);
    return toRequestDto(record, { detail: true });
  }

  /**
   * La tienda sale de los productos (todos de una, 400 si no) y el usuario
   * debe ser su dueño o staff (403). `title`, `flash_sale_id` y `note` son
   * obligatorios (400).
   */
  async create(body: FlashSaleRequestBodyDto, user: CurrentUserPayload) {
    const input = toWriteInput(body);
    if (!input.title || input.flashSaleId === undefined) {
      throw new BadRequestException(
        'Faltan campos obligatorios: `title` y `flash_sale_id`.',
      );
    }

    let shopId: number;
    try {
      ({ shopId } = await resolveFlashSaleRequestShop(input.productIds ?? []));
    } catch (error) {
      throw toWriteHttpException(error);
    }
    await this.assertShopAccess(user, shopId);

    try {
      const record = await createFlashSaleRequest({
        title: input.title,
        flashSaleId: input.flashSaleId,
        note: input.note ?? '',
        productIds: input.productIds ?? [],
        createdBy: user.sub,
        ...(input.language !== undefined && { language: input.language }),
      });
      return toRequestDto(record, { detail: true });
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /** Solo `pending` (409); los productos nuevos, de la misma tienda. */
  async update(
    rawId: string,
    body: FlashSaleRequestBodyDto,
    user: CurrentUserPayload,
  ) {
    const id = await this.findVisibleId(rawId, user);
    const input = toWriteInput(body);
    try {
      return toRequestDto(await updateFlashSaleRequest(id, input), {
        detail: true,
      });
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /** Solo si no está `approved` (409). Devuelve la solicitud borrada. */
  async remove(rawId: string, user: CurrentUserPayload) {
    const id = await this.findVisibleId(rawId, user);
    try {
      return toRequestDto(await deleteFlashSaleRequest(id), { detail: true });
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /**
   * Productos de `vendor_request_id` en `id ASC`, `search=name:X` ILIKE.
   * Solicitud inexistente o de una tienda ajena ⇒ 404.
   */
  async findRequestedProducts(
    query: GetFlashSaleRequestsDto,
    user: CurrentUserPayload,
  ) {
    const requestId = toId(query.vendor_request_id);
    if (requestId === null) throw notFound(query.vendor_request_id);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const tokens = parseSearch(query.search);

    let result: { items: ProductRecord[]; total: number } | null;
    try {
      result = await listFlashSaleRequestProducts({
        requestId,
        viewerId: viewerOf(user),
        name: tokens.name || undefined,
        page,
        limit,
      });
    } catch (error) {
      readError(error);
    }
    if (!result) throw notFound(requestId);

    const url = `/requested-products-for-flash-sale?search=${query.search}&limit=${limit}`;
    const data = result.items.map(toProductDto);
    return { data, ...paginate(result.total, page, limit, data.length, url) };
  }

  /** Id válido de una solicitud que el usuario puede ver; si no, 404. */
  private async findVisibleId(
    rawId: string,
    user: CurrentUserPayload,
  ): Promise<number> {
    const id = toId(rawId);
    if (id === null) throw notFound(rawId);
    let record: FlashSaleRequestRecord | null;
    try {
      record = await findFlashSaleRequestById(id, { viewerId: viewerOf(user) });
    } catch (error) {
      readError(error);
    }
    if (!record) throw notFound(id);
    return id;
  }
}
