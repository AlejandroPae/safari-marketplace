import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createFlashSale,
  deleteFlashSale,
  findFlashSaleBySlug,
  getUserFriendlyMessage,
  isPrismaConnectionError,
  listFlashSaleProducts,
  listFlashSales,
  updateFlashSale,
  type FlashSaleRecord,
  type Prisma,
  type ProductRecord,
  type UpdateFlashSaleInput,
} from '@safari/db';
import { paginate } from '#src/common/pagination/paginate.js';
import { parseSearch } from '#src/common/search/parse-search.js';
import { toWriteHttpException } from '#src/common/errors/domain-error.mapper.js';
import { toProductDto } from '#src/products/product-dto.mapper.js';
import { Product } from '#src/products/entities/product.entity.js';
import { FlashSale } from './entities/flash-sale.entity.js';
import { GetFlashSaleDto } from './dto/get-flash-sales.dto.js';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto.js';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto.js';

/** `Date` de una columna `timestamp` sin zona → `YYYY-MM-DD HH:MM:SS`, como el mock. */
function toSaleDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Producto de una venta: la proyección de `/products` (DA-7, V-1) con
 * `in_flash_sale: 1`. Los embebidos en la venta llevan además `pivot`, al
 * final como en el mock, con el id de la venta real (V-2).
 */
function toFlashSaleProductDto(
  record: ProductRecord,
  flashSaleId?: number,
): Product {
  return {
    ...toProductDto(record),
    in_flash_sale: 1,
    ...(flashSaleId !== undefined && {
      pivot: { flash_sale_id: flashSaleId, product_id: record.id },
    }),
  } as unknown as Product;
}

/**
 * `FlashSaleRecord` → las 18 claves de `flash-sale.json`, en su orden
 * (US-94, D-1). `deleted_at` y `translated_languages` son constantes (D-6).
 */
function toFlashSaleDto(record: FlashSaleRecord): FlashSale {
  return {
    id: record.id,
    title: record.title,
    slug: record.slug,
    description: record.description,
    start_date: toSaleDate(record.startDate),
    end_date: toSaleDate(record.endDate),
    sale_status: record.saleStatus,
    type: record.type,
    rate: record.rate,
    sale_builder: record.saleBuilder,
    image: record.image,
    cover_image: record.coverImage,
    language: record.language,
    deleted_at: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    translated_languages: ['en'],
    products: record.products.map((p) => toFlashSaleProductDto(p, record.id)),
  } as unknown as FlashSale;
}

function readError(error: unknown): never {
  if (isPrismaConnectionError(error)) {
    throw new ServiceUnavailableException(getUserFriendlyMessage(error));
  }
  throw new InternalServerErrorException(getUserFriendlyMessage(error));
}

/** Fecha del formulario (ISO). Ilegible ⇒ 400 antes de escribir. */
function toDate(raw: unknown, field: string): Date {
  const date = new Date(raw as string);
  if (raw === null || raw === '' || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`\`${field}\` no es una fecha válida.`);
  }
  return date;
}

/** El admin envía un booleano (`SwitchInput`); el mock guarda `1`/`0`. */
function toSaleStatus(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
}

/**
 * Campos editables comunes a crear y actualizar; una clave ausente no se
 * toca. `sale_builder.product_ids` es la lista de productos de la venta (lo
 * que envía el formulario del admin): presente ⇒ reemplaza la tabla puente.
 */
function toWriteInput(body: UpdateFlashSaleDto): UpdateFlashSaleInput {
  const builder =
    body.sale_builder && typeof body.sale_builder === 'object'
      ? (body.sale_builder as Record<string, unknown>)
      : undefined;
  const rawIds = builder?.product_ids;
  if (rawIds !== undefined && rawIds !== null && !Array.isArray(rawIds)) {
    throw new BadRequestException(
      '`sale_builder.product_ids` debe ser una lista.',
    );
  }
  const saleStatus = toSaleStatus(body.sale_status);

  return {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.start_date !== undefined && {
      startDate: toDate(body.start_date, 'start_date'),
    }),
    ...(body.end_date !== undefined && {
      endDate: toDate(body.end_date, 'end_date'),
    }),
    ...(body.type !== undefined && { type: body.type }),
    ...(body.rate != null && body.rate !== '' && { rate: Number(body.rate) }),
    ...(saleStatus !== undefined && { saleStatus }),
    ...(builder && { saleBuilder: builder as Prisma.InputJsonObject }),
    ...(Array.isArray(rawIds) && { productIds: rawIds.map(Number) }),
    ...(body.image != null && {
      image: body.image as unknown as Prisma.InputJsonValue,
    }),
    ...(body.cover_image != null && {
      coverImage: body.cover_image as unknown as Prisma.InputJsonValue,
    }),
    ...(body.language !== undefined && { language: body.language }),
  };
}

@Injectable()
export class FlashSaleService {
  /**
   * Crea la venta y sus productos en una transacción (`@safari/db`). La
   * venta es global: un `shop_id` del cuerpo se ignora.
   */
  async create(createFlashSaleDto: CreateFlashSaleDto): Promise<FlashSale> {
    // Fuera del try: el 400 de una fecha ilegible no debe pasar por
    // toWriteHttpException, que lo degradaría a 500.
    const input = toWriteInput(createFlashSaleDto);
    const { title, startDate, endDate, type, rate } = input;
    if (
      title == null ||
      startDate === undefined ||
      endDate === undefined ||
      type == null ||
      rate === undefined
    ) {
      throw new BadRequestException(
        '`title`, `start_date`, `end_date`, `type` y `rate` son obligatorios.',
      );
    }

    try {
      const record = await createFlashSale({
        ...input,
        title,
        startDate,
        endDate,
        type,
        rate,
      });
      return toFlashSaleDto(record);
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /**
   * Filtro real (US-94, V-4): `title` aplica ILIKE; el `shop_id` que envía
   * el admin se ignora porque la venta es global. Sin filtro por vigencia
   * (R-3). `page`/`limit` crudos a `paginate()` (Decision A).
   */
  async findAllFlashSale({ search, limit, page }: GetFlashSaleDto) {
    if (!page) page = 1;
    if (!limit) limit = 10;
    const url = `/flash-sale?search=${search}&limit=${limit}`;
    const tokens = parseSearch(search);

    let result: { items: FlashSaleRecord[]; total: number };
    try {
      result = await listFlashSales({
        title: tokens.title,
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      });
    } catch (error) {
      readError(error);
    }

    const data = result.items.map(toFlashSaleDto);
    return { data, ...paginate(result.total, page, limit, data.length, url) };
  }

  /** Por slug, con sus productos (DA-7); inexistente ⇒ 404 (V-5). */
  async getFlashSale(param: string, _language: string): Promise<FlashSale> {
    let record: FlashSaleRecord | null;
    try {
      record = await findFlashSaleBySlug(param);
    } catch (error) {
      readError(error);
    }

    if (!record) {
      throw new NotFoundException(
        `No existe una venta flash con slug \`${param}\`.`,
      );
    }
    return toFlashSaleDto(record);
  }

  /** Guarda de id de US-31 antes de tocar el driver. */
  async update(
    id: number,
    updateFlashSaleDto: UpdateFlashSaleDto,
  ): Promise<FlashSale> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new NotFoundException(`No existe una venta flash con id ${id}.`);
    }

    const input = toWriteInput(updateFlashSaleDto);
    try {
      return toFlashSaleDto(await updateFlashSale(id, input));
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /** Devuelve la venta borrada (V-6: el mock devolvía un string). */
  async remove(id: number): Promise<FlashSale> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new NotFoundException(`No existe una venta flash con id ${id}.`);
    }

    try {
      return toFlashSaleDto(await deleteFlashSale(id));
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /**
   * Productos de la venta del `slug` (V-3), en orden de `product_id`. Sin
   * `slug`, los de todas las ventas sin repetir. Slug inexistente ⇒ 404.
   */
  async findAllProductsByFlashSale({
    search,
    limit,
    page,
    slug,
  }: GetFlashSaleDto) {
    if (!page) page = 1;
    if (!limit) limit = 10;
    const url = `/products-by-flash-sale?search=${search}&limit=${limit}`;

    let result: { items: ProductRecord[]; total: number } | null;
    try {
      result = await listFlashSaleProducts({
        slug: slug || undefined,
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      });
    } catch (error) {
      readError(error);
    }

    if (!result) {
      throw new NotFoundException(
        `No existe una venta flash con slug \`${slug}\`.`,
      );
    }
    const data = result.items.map((p) => toFlashSaleProductDto(p));
    return { data, ...paginate(result.total, page, limit, data.length, url) };
  }
}
