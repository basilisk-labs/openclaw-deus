import { Controller, Get, Post, Patch, Delete, Param, Query, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { BeliefsService } from './beliefs.service';
import { BeliefDecayService } from './services/belief-decay.service';
import { BeliefExtractionService } from './services/belief-extraction.service';
import { BeliefContradictionService } from './services/belief-contradiction.service';
import { BeliefPromotionService } from './services/belief-promotion.service';
import { CreateBeliefDto } from './dto/create-belief.dto';
import { UpdateBeliefDto } from './dto/update-belief.dto';
import { BeliefQueryDto } from './dto/belief-query.dto';

@Controller('beliefs')
export class BeliefsController {
  constructor(
    private readonly beliefs: BeliefsService,
    private readonly decay: BeliefDecayService,
    private readonly extraction: BeliefExtractionService,
    private readonly contradictions: BeliefContradictionService,
    private readonly promotion: BeliefPromotionService,
  ) {}

  @Get()
  async findAll(@Query() query: BeliefQueryDto) {
    const result = await this.beliefs.findAll(query);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('review-queue')
  async getReviewQueue() {
    const result = await this.promotion.getPendingCandidates();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get(':beliefId')
  async findOne(@Param('beliefId') beliefId: string) {
    const result = await this.beliefs.findById(beliefId);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Post()
  async create(@Body() dto: CreateBeliefDto) {
    const result = await this.beliefs.create(dto);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Patch(':beliefId')
  async update(@Param('beliefId') beliefId: string, @Body() dto: UpdateBeliefDto) {
    const result = await this.beliefs.update(beliefId, dto);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Delete(':beliefId')
  async archive(@Param('beliefId') beliefId: string) {
    const result = await this.beliefs.archive(beliefId);
    if (result.isErr()) throw new NotFoundException(result.error.message);
    return result.value;
  }

  @Post('extract')
  async extract() {
    const result = await this.extraction.extractFromMemory();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Post('decay')
  async decay_() {
    const result = await this.decay.runDecayCycle();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Post('contradictions')
  async contradictions_() {
    const result = await this.contradictions.scanForContradictions();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Post('promote')
  async promote() {
    const result = await this.promotion.runPromotionReview();
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
