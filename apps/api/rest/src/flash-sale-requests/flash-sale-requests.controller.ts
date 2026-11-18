import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '#src/auth/decorators/current-user.decorator.js';
import {
  ADMIN_ONLY,
  ADMIN_OWNER_AND_STAFF,
  Permissions,
} from '#src/auth/decorators/permissions.decorator.js';
import {
  FlashSaleRequestBodyDto,
  GetFlashSaleRequestsDto,
} from './dto/flash-sale-request.dto.js';
import { FlashSaleRequestsService } from './flash-sale-requests.service.js';

/** Solicitudes de vendedores para ventas flash (US-97). Aprobar y rechazar, abajo (US-98). */
@Permissions(...ADMIN_OWNER_AND_STAFF)
@Controller('vendor-requests-for-flash-sale')
export class VendorRequestsForFlashSaleController {
  constructor(private service: FlashSaleRequestsService) {}

  @Get()
  findAll(
    @Query() query: GetFlashSaleRequestsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Post()
  create(
    @Body() body: FlashSaleRequestBodyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(body, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: FlashSaleRequestBodyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}

@Permissions(...ADMIN_OWNER_AND_STAFF)
@Controller('requested-products-for-flash-sale')
export class RequestedProductsForFlashSaleController {
  constructor(private service: FlashSaleRequestsService) {}

  @Get()
  findAll(
    @Query() query: GetFlashSaleRequestsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findRequestedProducts(query, user);
  }
}

/** Aprobar una solicitud (US-98). Solo super admin; cuerpo `{ id }`. */
@Permissions(...ADMIN_ONLY)
@Controller('approve-flash-sale-requested-products')
export class ApproveFlashSaleRequestedProductsController {
  constructor(private service: FlashSaleRequestsService) {}

  @Post()
  approve(@Body('id') id: unknown) {
    return this.service.approve(id);
  }
}

/** Rechazar una solicitud (US-98). Solo super admin; cuerpo `{ id }`. */
@Permissions(...ADMIN_ONLY)
@Controller('disapprove-flash-sale-requested-products')
export class DisapproveFlashSaleRequestedProductsController {
  constructor(private service: FlashSaleRequestsService) {}

  @Post()
  disapprove(@Body('id') id: unknown) {
    return this.service.disapprove(id);
  }
}
