import { Module } from '@nestjs/common';
import { EpisodeService } from './episode.service';
import { ProcedureService } from './procedure.service';
import { SelfAssessmentService } from './self-assessment.service';

@Module({
  providers: [EpisodeService, ProcedureService, SelfAssessmentService],
  exports: [EpisodeService, ProcedureService, SelfAssessmentService],
})
export class ExperienceModule {}
