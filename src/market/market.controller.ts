import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('fii/:ticker/dividends')
  getFiiDividends(@Param('ticker') ticker: string) {
    const normalizedTicker = ticker.toUpperCase();
    if (!/^[A-Z]{4}11$/.test(normalizedTicker)) {
      throw new BadRequestException('Ticker de FII inválido.');
    }

    return this.market.getFiiDividends(normalizedTicker);
  }
}
