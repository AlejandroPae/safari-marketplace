import { OmitType } from '@nestjs/swagger';
import { Author } from '../entities/author.entity.js';

/**
 * Lo que envía el formulario del admin (`author-form.tsx`): todos los campos
 * del autor salvo los que calcula o fija la API (US-93). `shop_id` llega,
 * pero el autor es global y se ignora.
 */
export class CreateAuthorDto extends OmitType(Author, [
  'id',
  'created_at',
  'updated_at',
  'products_count',
  'translated_languages',
]) {
  shop_id?: string;
}
