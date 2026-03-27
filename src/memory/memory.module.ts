import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { MemoryAggregationService } from './services/memory-aggregation.service';

@Module({
  providers: [MemoryService, MemoryAggregationService],
  controllers: [MemoryController],
  exports: [MemoryService, MemoryAggregationService],
})
export class MemoryModule {}
