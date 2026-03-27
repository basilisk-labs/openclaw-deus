import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyStrategy } from './api-key.strategy';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'deus-dev-secret-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  providers: [JwtStrategy, ApiKeyStrategy, AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
