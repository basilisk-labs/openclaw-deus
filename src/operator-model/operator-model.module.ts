import { Module } from '@nestjs/common';
import { OperatorModelService } from './operator-model.service';
import { SessionTrackerService } from './services/session-tracker.service';

@Module({
  providers: [OperatorModelService, SessionTrackerService],
  exports: [OperatorModelService, SessionTrackerService],
})
export class OperatorModelModule {}
