import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as JwtStrategy } from 'passport-jwt';

// Simple API key strategy using custom header extraction
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(JwtStrategy, 'api-key') {
  constructor() {
    super({
      jwtFromRequest: (req: any) => req?.headers?.['x-api-key'] || null,
      secretOrKey: process.env.API_KEY || 'no-api-key',
      ignoreExpiration: true,
    });
  }

  async validate(payload: any) {
    // If we got here, the API key matched as a JWT (or we can check header directly)
    return { userId: 'api-client', role: 'service' };
  }
}
