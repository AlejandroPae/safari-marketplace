import { PaginationArgs } from '#src/common/dto/pagination-args.dto.js';

/**
 * Cuerpo del formulario del admin
 * (`flash-sale-vendor-product-request-form.tsx`). Al editar llega también
 * `id`, que se ignora: manda el de la ruta. No trae `shop_id`: la tienda
 * se deduce de los productos.
 */
export class FlashSaleRequestBodyDto {
  title?: string;
  flash_sale_id?: number | string;
  note?: string;
  requested_product_ids?: (number | string)[];
  language?: string;
}

/**
 * Query de `/vendor-requests-for-flash-sale` y de
 * `/requested-products-for-flash-sale`. El admin manda además `searchJoin`,
 * `orderBy`, `sortedBy`, `language` y `with`, que se ignoran.
 */
export class GetFlashSaleRequestsDto extends PaginationArgs {
  /** `title:X;shop_id:N` (listado) o `name:X` (productos). */
  search?: string;
  shop_id?: string;
  vendor_request_id?: string;
}
