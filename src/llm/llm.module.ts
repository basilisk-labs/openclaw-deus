import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EventsModule } from "../events/events.module";
import { LlmClientService } from "./llm-client.service";
import { LlmBudgetService } from "./llm-budget.service";
import { LlmCacheService } from "./llm-cache.service";
import { LlmDecisionPolicyService } from "./llm-decision-policy.service";
import { LlmObservabilityService } from "./llm-observability.service";
import { DirectLLMAdapter } from "./direct-llm.adapter";
import { OpenClawGatewayAdapter } from "./openclaw-gateway.adapter";
import {
  DIRECT_LLM_ADAPTER,
  LLM_PORT,
  OPENCLOW_GATEWAY_ADAPTER,
} from "./llm-port.token";

@Global()
@Module({
  imports: [DatabaseModule, EventsModule],
  providers: [
    LlmClientService,
    LlmBudgetService,
    LlmCacheService,
    LlmDecisionPolicyService,
    LlmObservabilityService,
    DirectLLMAdapter,
    OpenClawGatewayAdapter,
    { provide: DIRECT_LLM_ADAPTER, useExisting: DirectLLMAdapter },
    { provide: OPENCLOW_GATEWAY_ADAPTER, useExisting: OpenClawGatewayAdapter },
    { provide: LLM_PORT, useExisting: LlmClientService },
  ],
  exports: [
    LlmClientService,
    LlmBudgetService,
    LlmCacheService,
    LlmDecisionPolicyService,
    LlmObservabilityService,
    LLM_PORT,
  ],
})
export class LlmModule {}
