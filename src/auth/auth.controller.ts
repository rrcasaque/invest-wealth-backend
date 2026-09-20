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
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    // Se o login retornar um refresh token (login direto sem 2FA),
    // seta o cookie HttpOnly
    if (result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
    }
    // Retorna o refresh token no corpo para fallback de localStorage
    return result;
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
      // Retorna o refresh token no corpo para fallback de localStorage
      // (em ambientes onde cookies podem ser bloqueados)
      return result;
    });
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Tenta ler o refresh token do cookie (método preferido)
    let incoming = this.readRefreshCookie(req);

    // Fallback: se não houver cookie, tenta ler do header X-Refresh-Token
    // (usado em ambientes onde cookies podem ser bloqueados, como alguns PWAs)
    if (!incoming) {
      incoming = req.headers['x-refresh-token'] as string | undefined;
    }

    const result = await this.auth.refresh(incoming ?? '');
    if (result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
    }
    // Retorna o refresh token no corpo para fallback de localStorage
    return result;
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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE * 1000,
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  }
}
