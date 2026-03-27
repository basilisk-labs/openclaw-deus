import { Module } from '@nestjs/common';
import { BeliefsService } from './beliefs.service';
import { BeliefsController } from './beliefs.controller';
import { BeliefDecayService } from './services/belief-decay.service';
import { BeliefExtractionService } from './services/belief-extraction.service';
import { BeliefContradictionService } from './services/belief-contradiction.service';
import { BeliefPromotionService } from './services/belief-promotion.service';
import { LlmExtractionService } from './services/llm-extraction.service';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [MemoryModule],
  providers: [
    BeliefsService,
    BeliefDecayService,
    BeliefExtractionService,
    BeliefContradictionService,
    BeliefPromotionService,
    LlmExtractionService,
  ],
  controllers: [BeliefsController],
  exports: [
    BeliefsService,
    BeliefDecayService,
    BeliefExtractionService,
    BeliefContradictionService,
    BeliefPromotionService,
    LlmExtractionService,
  ],
})
export class BeliefsModule {}
