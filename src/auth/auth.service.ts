import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  compareCode,
  generateNumericCode,
  generateRefreshToken,
  hashCode,
  hashToken,
} from '../common/crypto.util';
import { JwtPayload } from './decorators/current-user.decorator';
import { Login2faDto } from './dto/login-2fa.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoverDto } from './dto/password-recover.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const TICKET_TTL = '5m';
/** Refresh token TTL: 30 dias em milissegundos. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Janela de tolerância para reuso de refresh token rotacionado (permite
 *  recuperação de race conditions / retries de rede sem invalidar a sessão
 *  legítima). Após esse prazo, reuso = revogação imediata (possível roubo).
 *  Em desenvolvimento, usa 5 minutos para lidar com React Strict Mode.
 *  Em produção, usa 2 minutos para lidar com latência de rede e retries. */
const REUSE_GRACE_MS = process.env.NODE_ENV === 'production' ? 2 * 60 * 1000 : 5 * 60 * 1000;

export interface AuthResponse {
  status: 'success' | 'error' | '2fa_required';
  message?: string;
  session?: { userId: string; email: string; name: string };
  accessToken?: string;
  refreshToken?: string;
  ticket?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly codeSalt: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    // Reaproveita o JWT_SECRET como salt dos códigos (evita nova var de env).
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET ausente no ambiente.');
    this.codeSalt = secret;
  }

  // ---------- Cadastro ----------

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.workEmail.trim().toLowerCase();
    const name = dto.fullName.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, name, passwordHash, emailVerified: false },
    });

    await this.issueCode(user.id, user.email, user.name, 'EMAIL_VERIFICATION');

    return {
      status: 'success',
      message: 'Solicitação recebida. Você receberá um e-mail de verificação.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const ok = await this.consumeCode(user.id, 'EMAIL_VERIFICATION', dto.code);
    if (!ok) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    return {
      status: 'success',
      message: 'E-mail verificado. Você já pode entrar.',
    };
  }

  // ---------- Login + 2FA ----------

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mensagem genérica para não vazar existência de conta.
    const invalid = () => ({
      status: 'error' as const,
      message: 'E-mail ou senha incorretos.',
    });

    if (!user || !user.emailVerified) {
      return invalid();
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      return invalid();
    }

    const ticket = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        purpose: 'login_2fa',
      },
      { expiresIn: TICKET_TTL },
    );

    await this.issueCode(user.id, user.email, user.name, 'LOGIN_2FA');

    return {
      status: '2fa_required',
      message: 'Enviamos um código de verificação para o seu e-mail.',
      ticket,
    };
  }

  async login2fa(dto: Login2faDto): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.ticket);
    } catch {
      throw new UnauthorizedException('Ticket 2FA inválido ou expirado.');
    }

    if (payload.purpose !== 'login_2fa' || !payload.sub) {
      throw new UnauthorizedException('Ticket 2FA inválido.');
    }

    const ok = await this.consumeCode(payload.sub, 'LOGIN_2FA', dto.code);
    if (!ok) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.emailVerified) {
      throw new UnauthorizedException(
        'Conta não encontrada ou não verificada.',
      );
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      status: 'success',
      session: {
        userId: String(user.id),
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    };
  }

  // ---------- Refresh + Logout ----------

  /**
   * Valida um refresh token, revoga-o (rotação) e emite um novo par
   * access + refresh. Reuso de token já rotacionado dentro da janela de
   * tolerância retorna o mesmo refresh novo (idempotente para retries);
   * após a janela, revoga toda a cadeia (defesa contra roubo).
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente.');
    }

    const tokenHash = hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    // Token já consumido por rotação anterior.
    if (record.revokedAt) {
      // Janela de tolerância: permite retry idempotente de chamadas em race.
      const sinceRevoked = Date.now() - record.revokedAt.getTime();
      if (sinceRevoked <= REUSE_GRACE_MS && record.replacedById) {
        const replacement = await this.prisma.refreshToken.findUnique({
          where: { id: record.replacedById },
        });
        if (replacement && !replacement.revokedAt) {
          // Reemite o mesmo access token sem criar novo refresh (idempotente).
          const user = await this.prisma.user.findUnique({
            where: { id: record.userId },
          });
          if (!user) {
            throw new UnauthorizedException('Conta não encontrada.');
          }
          const accessToken = await this.jwt.signAsync(
            { sub: user.id, email: user.email, name: user.name },
            { expiresIn: ACCESS_TOKEN_TTL },
          );
          // Recupera o refresh token novo pelo hash — não temos o plaintext,
          // mas o cliente ainda o possui (foi entregue na rotação original).
          // Aqui apenas retornamos o access token; o cliente mantém o refresh.
          return {
            status: 'success',
            session: {
              userId: String(user.id),
              email: user.email,
              name: user.name,
            },
            accessToken,
          };
        }
      }
      // Reuso fora da janela: possível roubo. Revoga toda a cadeia do usuário.
      this.logger.warn(
        `Reuso de refresh token fora da janela — revogando sessão do usuário ${record.userId}.`,
      );
      await this.revokeAllUserRefreshTokens(record.userId);
      throw new UnauthorizedException(
        'Refresh token reutilizado. Sessão revogada por segurança.',
      );
    }

    // Token expirado.
    if (record.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Conta não encontrada.');
    }

    // Rotação: revoga o token atual e emite um novo.
    const newRefreshToken = await this.issueRefreshToken(user.id);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: {
        revokedAt: new Date(),
        replacedById: (
          await this.prisma.refreshToken.findUnique({
            where: { tokenHash: hashToken(newRefreshToken) },
            select: { id: true },
          })
        )?.id,
      },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, name: user.name },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    return {
      status: 'success',
      session: {
        userId: String(user.id),
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Revoga o refresh token específico (logout explícito).
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoga todos os refresh tokens de um usuário (comprometimento de sessão).
   */
  async revokeAllUserRefreshTokens(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Emite um novo refresh token opaco, persistindo apenas o hash.
   */
  private async issueRefreshToken(userId: number): Promise<string> {
    const plain = generateRefreshToken();
    const tokenHash = hashToken(plain);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return plain;
  }

  // ---------- Recuperação de senha ----------

  async requestPasswordRecovery(
    dto: PasswordRecoverDto,
  ): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Sempre retorna sucesso para não vazar cadastro.
    if (user) {
      await this.issueCode(user.id, user.email, user.name, 'PASSWORD_RESET');
    } else {
      this.logger.debug(
        `Password recovery solicitado para e-mail não cadastrado: ${email}`,
      );
    }

    return {
      status: 'success',
      message: `Instruções enviadas para ${email}.`,
    };
  }

  async resetPassword(dto: PasswordResetDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const ok = await this.consumeCode(user.id, 'PASSWORD_RESET', dto.code);
    if (!ok) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return {
      status: 'success',
      message: 'Senha redefinida. Você já pode entrar com a nova senha.',
    };
  }

  // ---------- /auth/me ----------

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return {
      userId: String(user.id),
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    };
  }

  // ---------- Helpers de código ----------

  private async issueCode(
    userId: number,
    email: string,
    name: string,
    type: 'EMAIL_VERIFICATION' | 'LOGIN_2FA' | 'PASSWORD_RESET',
  ): Promise<void> {
    // Invalida códigos anteriores do mesmo tipo.
    await this.prisma.emailCode.updateMany({
      where: { userId, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const plain = generateNumericCode(6);
    const hashed = hashCode(plain, this.codeSalt);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.emailCode.create({
      data: { userId, code: hashed, type, expiresAt },
    });

    if (type === 'EMAIL_VERIFICATION') {
      await this.mail.sendVerificationCode(email, name, plain);
    } else if (type === 'LOGIN_2FA') {
      await this.mail.sendLogin2faCode(email, name, plain);
    } else {
      await this.mail.sendPasswordResetCode(email, name, plain);
    }
  }

  private async consumeCode(
    userId: number,
    type: 'EMAIL_VERIFICATION' | 'LOGIN_2FA' | 'PASSWORD_RESET',
    plainCode: string,
  ): Promise<boolean> {
    const record = await this.prisma.emailCode.findFirst({
      where: { userId, type, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return false;

    // Expirado ou esgotado tentativas.
    if (
      record.expiresAt.getTime() < Date.now() ||
      record.attempts >= CODE_MAX_ATTEMPTS
    ) {
      await this.prisma.emailCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return false;
    }

    const valid = compareCode(plainCode, this.codeSalt, record.code);
    if (!valid) {
      await this.prisma.emailCode.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 },
      });
      return false;
    }

    await this.prisma.emailCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }
}
