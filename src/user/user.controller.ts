import { Controller } from '@nestjs/common';

/**
 * O endpoint público de listagem de usuários foi removido por segurança.
 * Dados do usuário autenticado ficam em /auth/me (protegido por JWT).
 *
 * Mantemos a classe apenas para preservar o módulo UserModule, que expõe
 * o UserService para outros módulos (ex.: AuthService).
 */
@Controller('users')
export class UserController {}
