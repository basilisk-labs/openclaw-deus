import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NightlyService } from './nightly.service';

@Injectable()
export class NightlyScheduler {
  private readonly logger = new Logger(NightlyScheduler.name);

  constructor(private readonly nightly: NightlyService) {}

  @Cron('0 3 * * *') // 3 AM daily
  async handleNightly(): Promise<void> {
    this.logger.log('Scheduled nightly run starting...');
    const result = await this.nightly.run();
    if (result.isOk()) {
      this.logger.log(`Nightly completed: ${result.value.stages.length} stages`);
    } else {
      this.logger.error(`Nightly failed: ${result.error.message}`);
    }
  }
}
