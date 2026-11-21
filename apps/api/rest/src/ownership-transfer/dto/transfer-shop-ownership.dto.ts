/**
 * `POST /transfer-shop-ownership`. El admin manda `{...vendor,
 * shop_id, vendor_id, message}`: del vendedor solo cuenta `vendor_id`.
 */
export class TransferShopOwnershipDto {
  shop_id?: string;
  vendor_id?: string;
  message?: string;
}
