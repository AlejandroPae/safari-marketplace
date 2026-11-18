import { Controller, Logger, Post, Body } from '@nestjs/common';
import { ImportsService } from './imports.service.js';
import { ImportDto } from './dto/create-import.dto.js';
import {
  ADMIN_ONLY,
  Permissions,
} from '#src/auth/decorators/permissions.decorator.js';

// US-99, DA-2: los tres imports son stubs. Se registra solo la ruta, nunca
// el cuerpo del request.
@Permissions(...ADMIN_ONLY)
@Controller()
export class ImportsController {
  private readonly logger = new Logger(ImportsController.name);

  constructor(private readonly importsService: ImportsService) {}

  @Post('import-attributes')
  importAttributes(@Body() _importAttributesDto: ImportDto) {
    this.logger.warn('POST /import-attributes es un stub: no importa nada');
    return true;
  }
  @Post('import-products')
  importProducts(@Body() _importProductsDto: ImportDto) {
    this.logger.warn('POST /import-products es un stub: no importa nada');
    return true;
  }
  @Post('import-variation-options')
  importVariationOptions(@Body() _importVariationOptionsDto: ImportDto) {
    this.logger.warn(
      'POST /import-variation-options es un stub: no importa nada',
    );
    return true;
  }
}
