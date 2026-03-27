import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { BeliefEventsService } from './belief-events.service';
import { WebhooksService } from './webhooks.service';

@Global()
@Module({
  providers: [EventsGateway, EventsService, BeliefEventsService, WebhooksService],
  exports: [EventsService, BeliefEventsService, WebhooksService],
})
export class EventsModule {}
