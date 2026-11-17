import { PickType } from '@nestjs/swagger';
import { FlashSale } from '../entities/flash-sale.entity.js';

/**
 * Lo que envía el formulario del admin (`flash-sale-form.tsx`). Los
 * productos de la venta llegan en `sale_builder.product_ids` (US-94).
 */
export class CreateFlashSaleDto extends PickType(FlashSale, [
  'title',
  'description',
  'end_date',
  'start_date',
  'type',
  'rate',
  'sale_status',
  'sale_builder',
  'image',
  'cover_image',
  'language',
]) {}
