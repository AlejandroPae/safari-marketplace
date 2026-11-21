import { WebHookService } from './web-hook.service.js';
import { Controller, Get } from '@nestjs/common';
import { Public } from '#src/auth/decorators/public.decorator.js';

// Llamadas de terceros (Stripe, Razorpay, PayPal) sin JWT — dejarlas caer
// en el default sería un 401 silencioso a un tercero. Sin validación de
// firma: los servicios son stubs.
@Public()
@Controller('web-hook')
export class WebHookController {
  constructor(private readonly webHookServices: WebHookService) {}
  @Get('razorpay')
  razorPay() {
    return this.webHookServices.razorPay();
  }
  @Get('stripe')
  stripe() {
    return this.webHookServices.stripe();
  }
  @Get('paypal')
  paypal() {
    return this.webHookServices.paypal();
  }
}
