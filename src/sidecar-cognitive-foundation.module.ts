import { Global, Module } from '@nestjs/common';
import { BayesianUpdaterService } from './cognitive/bayesian-updater.service';
import { CalibrationService } from './cognitive/calibration.service';
import { CausalGraphService } from './cognitive/causal-graph.service';
import { CognitiveConfigService } from './cognitive/cognitive-config.service';
import { GraphLinkingService } from './cognitive/graph-linking.service';
import { ImportanceScorerService } from './cognitive/importance-scorer.service';
import { SimilarityProvider } from './cognitive/similarity.provider';
import { TemporalCognitionService } from './cognitive/temporal-cognition.service';

@Global()
@Module({
  providers: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CalibrationService,
    CausalGraphService,
    GraphLinkingService,
    ImportanceScorerService,
    TemporalCognitionService,
  ],
  exports: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CalibrationService,
    CausalGraphService,
    GraphLinkingService,
    ImportanceScorerService,
    TemporalCognitionService,
  ],
})
export class SidecarCognitiveFoundationModule {}
