import { Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
import { IntrospectionService } from './introspection.service';
import { IntrospectionProfile } from '../common/types/introspection.types';

@Controller('introspect')
export class IntrospectionController {
  constructor(private readonly introspection: IntrospectionService) {}

  @Post()
  async run(@Query('profile') profile?: string) {
    const p: IntrospectionProfile = profile === 'sleep' ? 'sleep' : 'full';
    const result = await this.introspection.run(p);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('latest')
  async getLatest() {
    const result = await this.introspection.getLatestReport();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
