/**
 * Agency: the kernel acts on the world, not the training script.
 *
 * The kernel DECIDES what to do based on desire gradient.
 * The world EXECUTES actions and returns consequences.
 * The bridge connects them.
 */

/** What the kernel wants to do. */
export interface AgentAction {
  type: 'explore' | 'manipulate' | 'observe' | 'ask_help' | 'rest';
  target?: string;        // object to interact with
  method?: string;        // how: push, touch, drop, look, etc
  reason: string;         // why: from desire gradient
  energy_cost: number;
}

/** What the world returns after an action. */
export interface ActionConsequence {
  content: string;
  source: string;
  emotional_valence: number; // -1..1: negative (broke something) to positive (discovered something)
}

/** Bridge: world implements this, kernel calls it. */
export interface WorldBridge {
  /** Execute kernel's action in the world. Returns consequences. */
  executeAction(action: AgentAction): Promise<ActionConsequence[]>;

  /** Get available objects to interact with. */
  getAvailableTargets(): string[];

  /** Get available actions. */
  getAvailableActions(): string[];
}
