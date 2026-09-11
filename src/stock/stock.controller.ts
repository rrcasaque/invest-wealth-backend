import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { StockPositionInput, StockService } from './stock.service';

interface ExpectativeDividendBody {
  positions?: StockPositionInput[];
}

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Post('expectative-dividend')
  getExpectativeDividend(@Body() body: ExpectativeDividendBody) {
    if (!Array.isArray(body?.positions)) {
      throw new BadRequestException('A lista de posições é obrigatória.');
    }

    return this.stock.getExpectativeDividendMonth(body.positions);
  }
}
