import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createAuthor,
  deleteAuthor,
  findAuthorBySlug,
  getUserFriendlyMessage,
  isPrismaConnectionError,
  listAuthors,
  listTopAuthors,
  updateAuthor,
  type AuthorRecord,
  type Prisma,
  type UpdateAuthorInput,
} from '@safari/db';
import { paginate } from '#src/common/pagination/paginate.js';
import { parseSearch } from '#src/common/search/parse-search.js';
import { toWriteHttpException } from '#src/common/errors/domain-error.mapper.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';
import { Author } from './entities/author.entity.js';
import { AuthorPaginator, GetAuthorDto } from './dto/get-author.dto.js';
import { GetTopAuthorsDto } from './dto/get-top-authors.dto.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';

/**
 * `AuthorRecord` → las 15 claves de `authors.json`, en su orden (US-93, D-1).
 * `is_approved` sale como `1`/`0` porque el mock emite enteros;
 * `translated_languages` es constante (D-6). Los timestamps tienen columna
 * pero el mock no los emite, así que tampoco aquí.
 */
function toAuthorDto(record: AuthorRecord): Author {
  return {
    id: record.id,
    name: record.name,
    language: record.language,
    is_approved: record.isApproved ? 1 : 0,
    translated_languages: ['en'],
    slug: record.slug,
    bio: record.bio,
    quote: record.quote,
    products_count: record.productsCount,
    born: record.born ? record.born.toISOString() : null,
    death: record.death ? record.death.toISOString() : null,
    languages: record.languages,
    socials: record.socials,
    image: record.image,
    cover_image: record.coverImage,
  } as unknown as Author;
}

/** `1`/`0`, `true`/`false` (cuerpo o `search`) → booleano; lo demás no filtra. */
function toBoolean(raw: unknown): boolean | undefined {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false')
    return false;
  return undefined;
}

/** Fecha del formulario: vacía ⇒ `null`; ilegible ⇒ 400 antes de escribir. */
function toDate(raw: unknown, field: string): Date | null {
  if (raw === null || raw === '') return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`\`${field}\` no es una fecha válida.`);
  }
  return date;
}

function readError(error: unknown): never {
  if (isPrismaConnectionError(error)) {
    throw new ServiceUnavailableException(getUserFriendlyMessage(error));
  }
  throw new InternalServerErrorException(getUserFriendlyMessage(error));
}

/** Campos editables comunes a crear y actualizar; una clave ausente no se toca. */
function toWriteInput(dto: UpdateAuthorDto): UpdateAuthorInput {
  const isApproved = toBoolean(dto.is_approved);
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.bio !== undefined && { bio: dto.bio }),
    ...(dto.quote !== undefined && { quote: dto.quote }),
    ...(dto.born !== undefined && { born: toDate(dto.born, 'born') }),
    ...(dto.death !== undefined && { death: toDate(dto.death, 'death') }),
    ...(dto.languages !== undefined && { languages: dto.languages }),
    ...(dto.socials != null && {
      socials: dto.socials as unknown as Prisma.InputJsonValue,
    }),
    ...(dto.image != null && {
      image: dto.image as unknown as Prisma.InputJsonValue,
    }),
    ...(dto.cover_image != null && {
      coverImage: dto.cover_image as unknown as Prisma.InputJsonValue,
    }),
    ...(isApproved !== undefined && { isApproved }),
    ...(dto.language !== undefined && { language: dto.language }),
  };
}

@Injectable()
export class AuthorsService {
  /**
   * El autor es global: el `shop_id` del admin se ignora (US-93). `slug`
   * opcional: el admin lo reenvía al traducir un autor existente.
   */
  async create(createAuthorDto: CreateAuthorDto): Promise<Author> {
    // Fuera del try: el 400 de una fecha ilegible no debe pasar por
    // toWriteHttpException, que lo degradaría a 500.
    const input = toWriteInput(createAuthorDto);
    try {
      const record = await createAuthor({
        ...input,
        name: createAuthorDto.name,
        slug: createAuthorDto.slug ?? null,
      });
      return toAuthorDto(record);
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /**
   * Filtros reales con AND (US-93, V-1): el mock aplicaba Fuse con el último
   * token. `name` busca en nombre y slug; `is_approved` filtra; `type` (que
   * envía el admin) se ignora porque el autor no tiene tipo. `page`/`limit`
   * se pasan crudos a `paginate()` para conservar `per_page` como string
   * cuando el cliente manda `limit` (Decision A).
   */
  async getAuthors({
    page,
    limit,
    search,
  }: GetAuthorDto): Promise<AuthorPaginator> {
    if (!page) page = 1;
    if (!limit) limit = 30;
    const url = `/authors?search=${search}&limit=${limit}`;
    const tokens = parseSearch(search);

    let result: { items: AuthorRecord[]; total: number };
    try {
      result = await listAuthors({
        name: tokens.name,
        isApproved: toBoolean(tokens.is_approved),
        page: Number(page) || 1,
        limit: Number(limit) || 30,
      });
    } catch (error) {
      readError(error);
    }

    const data = result.items.map(toAuthorDto);
    return { data, ...paginate(result.total, page, limit, data.length, url) };
  }

  /** Por slug, como el mock; inexistente ⇒ 404 (V-2). */
  async getAuthorBySlug(slug: string): Promise<Author> {
    let record: AuthorRecord | null;
    try {
      record = await findAuthorBySlug(slug);
    } catch (error) {
      readError(error);
    }

    if (!record) {
      throw new NotFoundException(`No existe un autor con slug \`${slug}\`.`);
    }
    return toAuthorDto(record);
  }

  /** Los de más productos (V-4); sin paginador, como el mock. Default 10. */
  async getTopAuthors({ limit }: GetTopAuthorsDto): Promise<Author[]> {
    try {
      return (await listTopAuthors(Number(limit) || 10)).map(toAuthorDto);
    } catch (error) {
      readError(error);
    }
  }

  /** Guarda de id de US-31 antes de tocar el driver. */
  async update(id: number, updateAuthorDto: UpdateAuthorDto): Promise<Author> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new NotFoundException(`No existe un autor con id ${id}.`);
    }

    const input = toWriteInput(updateAuthorDto);
    try {
      return toAuthorDto(await updateAuthor(id, input));
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }

  /** Devuelve el autor borrado (V-3: el mock devolvía un string). */
  async remove(id: number): Promise<Author> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new NotFoundException(`No existe un autor con id ${id}.`);
    }

    try {
      return toAuthorDto(await deleteAuthor(id));
    } catch (error) {
      throw toWriteHttpException(error);
    }
  }
}
