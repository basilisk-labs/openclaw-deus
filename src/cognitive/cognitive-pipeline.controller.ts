import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { CognitivePipelineService } from './cognitive-pipeline.service';

@Controller('cognitive')
export class CognitivePipelineController {
  constructor(private readonly pipeline: CognitivePipelineService) {}

  @Post('process-message')
  async processMessage(@Body('message') message: string) {
    if (!message || message.trim().length < 2) throw new BadRequestException('message required');
    const result = await this.pipeline.processMessage(message);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
