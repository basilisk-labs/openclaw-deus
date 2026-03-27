import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { CognitiveConfigService } from './cognitive-config.service';

@Controller('config/cognitive')
export class CognitiveConfigController {
  constructor(private readonly config: CognitiveConfigService) {}

  @Get()
  getAll() {
    return this.config.getAll();
  }

  @Post()
  async set(@Body() body: { key: string; value: number; reason?: string }) {
    if (!body.key || body.value === undefined) throw new BadRequestException('key and value required');
    const result = await this.config.set(body.key, body.value, body.reason);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return { key: body.key, value: this.config.get(body.key) };
  }

  @Post('adjust')
  async adjust(@Body() body: { key: string; delta: number; reason: string }) {
    if (!body.key || body.delta === undefined) throw new BadRequestException('key and delta required');
    const result = await this.config.adjust(body.key, body.delta, body.reason || 'manual');
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return { key: body.key, value: result.value };
  }

  @Post('feedback')
  async feedback(@Body() body: Record<string, unknown>) {
    await this.config.adjustFromFeedback(body as Parameters<CognitiveConfigService['adjustFromFeedback']>[0]);
    return { status: 'adjusted', params: this.config.getAll().filter((p) => p.last_adjusted) };
  }
}
