import { Injectable, Optional } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { SurrealService } from '../database/surreal.service';
import { LLMCallEvent } from './types/llm-port.types';

@Injectable()
export class LlmObservabilityService {
  constructor(
    @Optional() private readonly db?: SurrealService,
    @Optional() private readonly events?: EventsService,
  ) {}

  async record(event: LLMCallEvent): Promise<void> {
    if (this.db) {
      await this.db.create('llm_call_event', {
        ...event,
        created_at: new Date().toISOString(),
      } as Record<string, unknown>);
    }

    if (this.events) {
      await this.events.emit('llm.called', event);
    }
  }
}
