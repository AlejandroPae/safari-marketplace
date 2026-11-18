import { Module } from '@nestjs/common';
import {
  RequestedProductsForFlashSaleController,
  VendorRequestsForFlashSaleController,
} from './flash-sale-requests.controller.js';
import { FlashSaleRequestsService } from './flash-sale-requests.service.js';

@Module({
  controllers: [
    VendorRequestsForFlashSaleController,
    RequestedProductsForFlashSaleController,
  ],
  providers: [FlashSaleRequestsService],
})
export class FlashSaleRequestsModule {}
