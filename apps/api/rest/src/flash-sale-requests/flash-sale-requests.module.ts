import { Module } from '@nestjs/common';
import {
  ApproveFlashSaleRequestedProductsController,
  DisapproveFlashSaleRequestedProductsController,
  RequestedProductsForFlashSaleController,
  VendorRequestsForFlashSaleController,
} from './flash-sale-requests.controller.js';
import { FlashSaleRequestsService } from './flash-sale-requests.service.js';

@Module({
  controllers: [
    VendorRequestsForFlashSaleController,
    RequestedProductsForFlashSaleController,
    ApproveFlashSaleRequestedProductsController,
    DisapproveFlashSaleRequestedProductsController,
  ],
  providers: [FlashSaleRequestsService],
})
export class FlashSaleRequestsModule {}
