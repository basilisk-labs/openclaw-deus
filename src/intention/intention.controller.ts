import { Controller, Get, Post, Patch, Param, Body, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { IntentionService } from './intention.service';
import { IntentionRecognitionService } from './services/intention-recognition.service';
import { IntentionStackService } from './services/intention-stack.service';
import { IntentionStatus, IntentionProgress } from '../common/types/intention.types';

@Controller('intentions')
export class IntentionController {
  constructor(
    private readonly intentions: IntentionService,
    private readonly recognition: IntentionRecognitionService,
    private readonly stack: IntentionStackService,
  ) {}

  @Get()
  async findActive() {
    const result = await this.intentions.findActive();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('stack')
  async getStack() {
    const result = await this.stack.getStack();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get(':intentionId')
  async findOne(@Param('intentionId') id: string) {
    const result = await this.intentions.findById(id);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Post('recognize')
  async recognize(@Body('message') message: string) {
    if (!message) throw new BadRequestException('message is required');
    const result = await this.recognition.recognizeFromMessage(message);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Patch(':intentionId/transition')
  async transition(
    @Param('intentionId') id: string,
    @Body('status') status: string,
    @Body('reason') reason: string,
  ) {
    const result = await this.intentions.transition(id, status as IntentionStatus, reason || 'manual transition', 'operator');
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Patch(':intentionId/progress')
  async updateProgress(
    @Param('intentionId') id: string,
    @Body() progress: Record<string, unknown>,
  ) {
    const result = await this.intentions.updateProgress(id, progress as Partial<IntentionProgress>);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }
}
