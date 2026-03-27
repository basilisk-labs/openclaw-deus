import { Injectable, Logger } from '@nestjs/common';
import { OperatorModelService } from '../operator-model.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SessionState } from '../../common/types/operator-model.types';

const FRUSTRATION_SIGNALS = [
  'нет', 'не то', 'неправильно', 'опять', 'ты не понял',
  'wrong', 'no', 'not what I', 'again', 'you misunderstood', 'wtf', 'ffs',
];

@Injectable()
export class SessionTrackerService {
  private readonly logger = new Logger(SessionTrackerService.name);
  private lastMessageTime: number = Date.now();
  private messageCount = 0;
  private recentMessageLengths: number[] = [];

  constructor(
    private readonly operatorModel: OperatorModelService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Call on every operator message. Pure TypeScript — no LLM.
   * Updates session state: engagement, frustration, cognitive load.
   */
  async trackMessage(message: string): Promise<void> {
    const now = Date.now();
    const timeSinceLast = now - this.lastMessageTime;
    this.lastMessageTime = now;
    this.messageCount++;
    this.recentMessageLengths.push(message.length);
    if (this.recentMessageLengths.length > 20) this.recentMessageLengths.shift();

    const updates: Partial<SessionState> = {
      last_interaction: new Date().toISOString(),
      interaction_count: this.messageCount,
    };

    // Engagement: based on message frequency (thresholds from CognitiveConfig)
    if (timeSinceLast < this.config.get('session.active_threshold_ms')) updates.engagement = 'active';
    else if (timeSinceLast < this.config.get('session.sporadic_threshold_ms')) updates.engagement = 'sporadic';
    else updates.engagement = 'idle';

    // Frustration: check for signals
    const lower = message.toLowerCase();
    const frustrated = FRUSTRATION_SIGNALS.some((s) => lower.includes(s));
    if (frustrated) {
      const model = await this.operatorModel.getModel();
      const current = model.isOk() ? model.value.session.frustration_signals : 0;
      updates.frustration_signals = current + 1;
    }

    // Cognitive load: based on message length pattern + topic diversity
    const avgLength = this.recentMessageLengths.reduce((s, l) => s + l, 0) / this.recentMessageLengths.length;
    if (avgLength > this.config.get('session.high_load_length')) updates.cognitive_load = 'high';
    else if (avgLength > this.config.get('session.medium_load_length')) updates.cognitive_load = 'medium';
    else updates.cognitive_load = 'low';

    await this.operatorModel.updateSession(updates);
  }

  /**
   * Reset session state (new conversation).
   */
  async resetSession(): Promise<void> {
    this.messageCount = 0;
    this.recentMessageLengths = [];
    this.lastMessageTime = Date.now();
    await this.operatorModel.updateSession({
      cognitive_load: 'low',
      engagement: 'active',
      frustration_signals: 0,
      interaction_count: 0,
    });
  }
}
