import { Controller, Get, Post, BadRequestException } from '@nestjs/common';
import { WorldModelService } from './world-model.service';

@Controller('world-model')
export class WorldModelController {
  constructor(private readonly worldModel: WorldModelService) {}

  @Get()
  async getLatest() {
    const result = await this.worldModel.getLatest();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Post('refresh')
  async refresh() {
    const result = await this.worldModel.build();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
