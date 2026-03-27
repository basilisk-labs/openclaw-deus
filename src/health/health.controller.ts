import { Controller, Get, BadRequestException } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../auth/auth.guard';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async getHealth() {
    const result = await this.health.getHealth();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
