import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { createHmac } from 'node:crypto';
import { DomainError, ValidationError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { WebhookRegistration, WebhookDelivery } from '../common/types/events.types';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly db: SurrealService) {}

  async register(url: string, events: string[], secret: string): Promise<Result<WebhookRegistration, DomainError>> {
    if (!url.startsWith('http')) {
      return err(new ValidationError('Webhook URL must start with http'));
    }

    return this.db.create<WebhookRegistration>('webhook', {
      url,
      events,
      secret,
      active: true,
      created_at: new Date().toISOString(),
    } as unknown as WebhookRegistration);
  }

  async listActive(): Promise<Result<WebhookRegistration[], DomainError>> {
    return this.db.query<WebhookRegistration>('SELECT * FROM webhook WHERE active = true');
  }

  async deliver(event: string, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.listActive();
    if (webhooks.isErr()) return;

    for (const webhook of webhooks.value) {
      if (!webhook.events.includes(event) && !webhook.events.includes('*')) continue;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Deus-Event': event,
            'X-Deus-Signature': this.sign(JSON.stringify(payload), webhook.secret),
          },
          body: JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(5000),
        });

        await this.db.create('webhook_delivery', {
          webhook_id: webhook.id,
          event,
          payload,
          status: response.status,
          delivered_at: new Date().toISOString(),
        } as Record<string, unknown>);
      } catch (error) {
        this.logger.warn(`Webhook delivery to ${webhook.url} failed: ${error}`);
      }
    }
  }

  private sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }
}
