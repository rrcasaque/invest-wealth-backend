import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Login2faDto } from './dto/login-2fa.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/** Nome do cookie que armazena o refresh token (HttpOnly, Secure, SameSite). */
export const REFRESH_COOKIE_NAME = 'iw_refresh';
/** TTL do cookie do refresh token: 30 dias, em segundos. */
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;


@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('login-2fa')
  login2fa(
    @Body() dto: Login2faDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login2fa(dto).then((result) => {
      if (result.refreshToken) {
        this.setRefreshCookie(res, result.refreshToken);
      }
      // Não expõe o refresh token no corpo da resposta JSON.
      const { refreshToken: _rt, ...body } = result;
      void _rt;
      return body;
    });
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const incoming = this.readRefreshCookie(req);
    const result = await this.auth.refresh(incoming ?? '');
    if (result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
    }
    const { refreshToken: _rt, ...body } = result;
    void _rt;
    return body;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const incoming = this.readRefreshCookie(req);
    await this.auth.logout(incoming);
    this.clearRefreshCookie(res);
    return { status: 'success' as const };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }

  // ---------- Helpers de cookie ----------

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE * 1000,
      path: '/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  }
}
