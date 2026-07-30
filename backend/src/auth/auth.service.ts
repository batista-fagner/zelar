import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../common/entities/user.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Seed único: se ainda não existe nenhum usuário, cria o admin inicial a partir
  // de ADMIN_EMAIL/ADMIN_PASSWORD (env). Não roda de novo depois que já existe alguém —
  // não sobrescreve senha trocada manualmente no banco.
  async onModuleInit() {
    const existing = await this.usersRepo.count();
    if (existing > 0) return;

    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('Nenhum usuário cadastrado e ADMIN_EMAIL/ADMIN_PASSWORD não definidos — login ficará indisponível até criar um usuário.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.usersRepo.save(this.usersRepo.create({ email: email.toLowerCase().trim(), passwordHash }));
    this.logger.log(`Usuário inicial criado: ${email}`);
  }

  async login(email: string, password: string): Promise<{ accessToken: string; email: string }> {
    const user = await this.usersRepo.findOne({ where: { email: (email ?? '').toLowerCase().trim() } });
    if (!user) throw new UnauthorizedException('E-mail ou senha incorretos.');

    const valid = await bcrypt.compare(password ?? '', user.passwordHash);
    if (!valid) throw new UnauthorizedException('E-mail ou senha incorretos.');

    const accessToken = await this.jwtService.signAsync({ sub: user.id, email: user.email });
    return { accessToken, email: user.email };
  }
}
