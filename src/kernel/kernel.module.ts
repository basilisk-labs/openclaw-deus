import { Module, OnModuleInit } from '@nestjs/common';
import { TraceGraphService } from './memory/trace-graph.service';
import { CommitKernelService } from './commit/commit-kernel.service';
import { KernelLoopService } from './kernel-loop.service';
import { SensoryAgent } from './agents/sensory.agent';
import { PredictiveAgent } from './agents/predictive.agent';
import { AffectiveAgent } from './agents/affective.agent';
import { PriorityAgent } from './agents/priority.agent';
import { StrategicAgent } from './agents/strategic.agent';
import { AffectiveStateService } from './affect/affective-state.service';
import { NarrativeService } from './narrative/narrative.service';
import { SubstrateBridgeService } from './substrate-bridge.service';
import { ActiveCognitionService } from './cognition/active-cognition.service';
import { ConceptSpaceService } from './space/concept-space.service';
import { FingerprinterService } from './sensory/fingerprinter.service';
import { ModalityDiscoveryService } from './sensory/modality-discovery.service';
import { RawStreamService } from './sensory/raw-stream.service';
import { AttentionService } from './sensory/attention.service';
import { EnergyService } from './energy.service';
import { LightConeService } from './light-cone.service';
import { DevelopmentalMetricsService } from './developmental-metrics.service';
import { SensorimotorPredictorService } from './sensorimotor-predictor.service';
import { WorldModelModule } from '../world-model/world-model.module';
import { IntentionModule } from '../intention/intention.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DeliberationModule } from '../deliberation/deliberation.module';
import { ExperienceModule } from '../experience/experience.module';
import { OperatorModelModule } from '../operator-model/operator-model.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [
    IntentionModule,
    KnowledgeModule,
    DeliberationModule,
    ExperienceModule,
    OperatorModelModule,
    PolicyModule,
    WorldModelModule,
  ],
  providers: [
    TraceGraphService,
    CommitKernelService,
    KernelLoopService,
    AffectiveStateService,
    NarrativeService,
    SubstrateBridgeService,
    ActiveCognitionService,
    ConceptSpaceService,
    FingerprinterService,
    ModalityDiscoveryService,
    RawStreamService,
    AttentionService,
    EnergyService,
    LightConeService,
    DevelopmentalMetricsService,
    SensorimotorPredictorService,
    SensoryAgent,
    PredictiveAgent,
    AffectiveAgent,
    PriorityAgent,
    StrategicAgent,
  ],
  exports: [
    TraceGraphService,
    CommitKernelService,
    KernelLoopService,
    AffectiveStateService,
    NarrativeService,
    SubstrateBridgeService,
    ActiveCognitionService,
    ConceptSpaceService,
    RawStreamService,
    ModalityDiscoveryService,
    EnergyService,
    LightConeService,
    DevelopmentalMetricsService,
    SensorimotorPredictorService,
  ],
})
export class KernelModule implements OnModuleInit {
  constructor(
    private readonly kernelLoop: KernelLoopService,
    private readonly conceptSpace: ConceptSpaceService,
    private readonly modalityDiscovery: ModalityDiscoveryService,
    private readonly sensory: SensoryAgent,
    private readonly predictive: PredictiveAgent,
    private readonly affective: AffectiveAgent,
    private readonly priority: PriorityAgent,
    private readonly strategic: StrategicAgent,
  ) {}

  async onModuleInit() {
    await this.conceptSpace.loadDimensions();
    await this.modalityDiscovery.load();

    // Register agents into the kernel swarm
    this.kernelLoop.registerAgent(this.sensory);
    this.kernelLoop.registerAgent(this.predictive);
    this.kernelLoop.registerAgent(this.affective);
    this.kernelLoop.registerAgent(this.priority);
    this.kernelLoop.registerAgent(this.strategic);
  }
}
