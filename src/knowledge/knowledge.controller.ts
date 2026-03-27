import { Controller, Get, Post, Param, Query, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeExtractionService } from './services/knowledge-extraction.service';
import { KnowledgeGapService } from './services/knowledge-gap.service';
import { KnowledgeKind, KnowledgeStatus } from '../common/types/knowledge.types';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly extraction: KnowledgeExtractionService,
    private readonly gaps: KnowledgeGapService,
  ) {}

  @Get()
  async findAll(@Query('kind') kind?: string, @Query('domain') domain?: string, @Query('status') status?: string) {
    const result = await this.knowledge.findAll({ kind: kind as KnowledgeKind, domain, status: status as KnowledgeStatus });
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('gaps')
  async findGaps() {
    const result = await this.gaps.findOpen();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.knowledge.findById(id);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Post('extract')
  async extract(@Body('content') content: string) {
    if (!content) throw new BadRequestException('content is required');
    const result = await this.extraction.extractFromInteraction(content);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
