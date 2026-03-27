import { Global, Module } from '@nestjs/common';
import { LlmClientService } from './llm-client.service';
import { LlmBudgetService } from './llm-budget.service';
import { LlmCacheService } from './llm-cache.service';

@Global()
@Module({
  providers: [LlmClientService, LlmBudgetService, LlmCacheService],
  exports: [LlmClientService, LlmBudgetService, LlmCacheService],
})
export class LlmModule {}
