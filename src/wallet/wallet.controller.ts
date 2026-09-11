import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WalletAssetType } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDividendDto } from './dto/create-dividend.dto';
import { CreateWalletAssetDto } from './dto/create-wallet-asset.dto';
import { ImportB3Dto } from './dto/import-b3.dto';
import { UpdateWalletAssetDto } from './dto/update-wallet-asset.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Post('import/b3')
  importB3(@CurrentUser() user: JwtPayload, @Body() dto: ImportB3Dto) {
    return this.wallet.importB3(user.sub, dto);
  }

  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.wallet.summary(user.sub);
  }

  @Get('assets')
  list(@CurrentUser() user: JwtPayload, @Query('type') type?: WalletAssetType) {
    return this.wallet.list(user.sub, type);
  }

  @Post('assets')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWalletAssetDto) {
    return this.wallet.create(user.sub, dto);
  }

  @Get('assets/:assetId/dividends')
  listDividends(
    @CurrentUser() user: JwtPayload,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Query('year') year?: string,
  ) {
    return this.wallet.listDividends(
      user.sub,
      assetId,
      year ? Number(year) : undefined,
    );
  }

  @Post('assets/:assetId/dividends')
  createDividend(
    @CurrentUser() user: JwtPayload,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Body() dto: CreateDividendDto,
  ) {
    return this.wallet.createDividend(user.sub, assetId, dto);
  }

  @Patch('assets/:assetId/dividends/:id')
  updateDividend(
    @CurrentUser() user: JwtPayload,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Param('id') id: string,
    @Body() dto: CreateDividendDto,
  ) {
    return this.wallet.updateDividend(user.sub, assetId, id, dto);
  }

  @Delete('assets/:assetId/dividends/:id')
  removeDividend(
    @CurrentUser() user: JwtPayload,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Param('id') id: string,
  ) {
    return this.wallet.removeDividend(user.sub, assetId, id);
  }

  @Get('assets/:id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wallet.findOne(user.sub, id);
  }

  @Patch('assets/:id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWalletAssetDto,
  ) {
    return this.wallet.update(user.sub, id, dto);
  }

  @Delete('assets/:id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.wallet.remove(user.sub, id);
  }
}
