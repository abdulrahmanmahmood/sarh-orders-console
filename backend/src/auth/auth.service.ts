import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { hashPassword, verifyPassword } from '../security/password';
import { JWT_LIFETIME_SECONDS } from './auth.constants';
import { AccessTokenPayload, AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword('not-a-real-user-password');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(emailInput: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('lower(user.email) = :email', { email })
      .getOne();

    const valid = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    const authenticatedUser: AuthenticatedUser = { id: user.id, email: user.email, role: user.role };
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      algorithm: 'HS256',
      issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
      audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      expiresIn: JWT_LIFETIME_SECONDS,
    });
    return { token, user: authenticatedUser };
  }
}

