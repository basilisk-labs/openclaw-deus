/**
 * SocialWorld: World of SOCIAL INTERACTIONS.
 *
 * Same kernel, different domain. Instead of physical objects the child
 * encounters characters with moods, relations and social dynamics.
 *
 * Social events: arrivals, departures, sharing, taking, conflict, cooperation.
 * Consequences carry valence: sharing/cooperation positive, taking/conflict negative.
 *
 * Levels mirror EvolvingWorld complexity curve:
 *   Level 0 — мама always present, one other character
 *   Level 1 — two characters, mood changes
 *   Level 2 — three characters, cooperation/conflict
 *   Level 3 — all characters, complex multi-party dynamics
 */

import { RawSensoryEvent } from '../kernel/sensory/modality.types';
import { DevelopmentalSnapshot } from '../kernel/developmental-metrics.service';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ═══════════════════════════════════════════
// CHARACTER DATABASE
// ═══════════════════════════════════════════

type Mood = 'весёлый' | 'грустный' | 'спокойный' | 'раздражённый' | 'ласковый' | 'уставший';
type Relation = 'мама' | 'папа' | 'бабушка' | 'друг' | 'подруга';
type CharAction = 'стоит рядом' | 'улыбается' | 'разговаривает' | 'обнимает' | 'ушёл' | 'пришёл';

interface SocialCharacter {
  name: string;
  relation: Relation;
  mood: Mood;
  action: CharAction;
  present: boolean;
  trustLevel: number;   // 0-1 — how much the child trusts this character
}

const CHARACTER_TEMPLATES: Array<{ name: string; relation: Relation; baseMood: Mood }> = [
  { name: 'мама', relation: 'мама', baseMood: 'ласковый' },
  { name: 'папа', relation: 'папа', baseMood: 'спокойный' },
  { name: 'бабушка', relation: 'бабушка', baseMood: 'ласковый' },
  { name: 'Петя', relation: 'друг', baseMood: 'весёлый' },
  { name: 'Маша', relation: 'подруга', baseMood: 'весёлый' },
];

const ALL_MOODS: Mood[] = ['весёлый', 'грустный', 'спокойный', 'раздражённый', 'ласковый', 'уставший'];

// ═══════════════════════════════════════════
// CHARACTER PROPERTY DB (ground truth)
// ═══════════════════════════════════════════

const CHARACTER_PROPERTIES: Record<string, Record<string, string>> = {
  мама:    { relation: 'мама', personality: 'заботливая', voice: 'тёплый', age: 'взрослая', behavior: 'защищает' },
  папа:    { relation: 'папа', personality: 'надёжный', voice: 'низкий', age: 'взрослый', behavior: 'играет' },
  бабушка: { relation: 'бабушка', personality: 'добрая', voice: 'мягкий', age: 'пожилая', behavior: 'угощает' },
  Петя:    { relation: 'друг', personality: 'шумный', voice: 'громкий', age: 'ребёнок', behavior: 'играет' },
  Маша:    { relation: 'подруга', personality: 'тихая', voice: 'тихий', age: 'ребёнок', behavior: 'делится' },
};

// ═══════════════════════════════════════════
// SOCIAL WORLD LEVELS
// ═══════════════════════════════════════════

interface SocialLevel {
  level: number;
  activeCharacters: string[];   // character names available at this level
  mamaPresence: number;         // 0-1 probability
  conflictRate: number;         // 0-1
  cooperationRate: number;      // 0-1
  moodVolatility: number;       // 0-1 how often moods change
}

const SOCIAL_LEVELS: SocialLevel[] = [
  {
    level: 0,
    activeCharacters: ['мама', 'папа'],
    mamaPresence: 1.0,
    conflictRate: 0.0,
    cooperationRate: 0.1,
    moodVolatility: 0.05,
  },
  {
    level: 1,
    activeCharacters: ['мама', 'папа', 'бабушка'],
    mamaPresence: 0.8,
    conflictRate: 0.05,
    cooperationRate: 0.2,
    moodVolatility: 0.1,
  },
  {
    level: 2,
    activeCharacters: ['мама', 'папа', 'бабушка', 'Петя'],
    mamaPresence: 0.6,
    conflictRate: 0.1,
    cooperationRate: 0.3,
    moodVolatility: 0.15,
  },
  {
    level: 3,
    activeCharacters: ['мама', 'папа', 'бабушка', 'Петя', 'Маша'],
    mamaPresence: 0.3,
    conflictRate: 0.15,
    cooperationRate: 0.4,
    moodVolatility: 0.2,
  },
];

// ═══════════════════════════════════════════
// PROGRESSION TRIGGERS
// ═══════════════════════════════════════════

interface SocialProgressionTrigger {
  from: number;
  to: number;
  check: (snap: DevelopmentalSnapshot) => boolean;
  description: string;
}

const SOCIAL_PROGRESSION_TRIGGERS: SocialProgressionTrigger[] = [
  {
    from: 0, to: 1,
    check: (s) => s.world_model.property_accuracy > 0.3 && s.cognitive.concept_space_coverage > 0.05,
    description: 'accuracy > 30% AND coverage > 5%',
  },
  {
    from: 1, to: 2,
    check: (s) => s.world_model.property_accuracy > 0.4 && s.cognitive.abstraction_count >= 1,
    description: 'accuracy > 40% AND abstractions >= 1',
  },
  {
    from: 2, to: 3,
    check: (s) => s.world_model.property_accuracy > 0.5 && s.agency.explore_exploit_shift > 0,
    description: 'accuracy > 50% AND explore->exploit shift observed',
  },
];

// ═══════════════════════════════════════════
// SOCIAL WORLD
// ═══════════════════════════════════════════

interface SocialWorldState {
  characters: SocialCharacter[];
  location: string;
  tick: number;
  level: number;
  childEnergy: number;
  lastSocialEvent: string;
}

export class SocialWorld {
  private state: SocialWorldState;
  private eventCounter = 0;
  private currentLevel: SocialLevel;
  private levelHistory: Array<{ level: number; tick: number }> = [];

  constructor() {
    this.currentLevel = SOCIAL_LEVELS[0];
    this.state = {
      characters: this.buildCharacters(this.currentLevel),
      location: 'дома',
      tick: 0,
      level: 0,
      childEnergy: 1.0,
      lastSocialEvent: '',
    };
    this.levelHistory.push({ level: 0, tick: 0 });
  }

  private buildCharacters(level: SocialLevel): SocialCharacter[] {
    return level.activeCharacters.map(name => {
      const tpl = CHARACTER_TEMPLATES.find(c => c.name === name)!;
      return {
        name: tpl.name,
        relation: tpl.relation,
        mood: tpl.baseMood,
        action: 'стоит рядом',
        present: tpl.name === 'мама' ? Math.random() < level.mamaPresence : Math.random() < 0.5,
        trustLevel: tpl.relation === 'мама' ? 0.9 : 0.5,
      };
    });
  }

  // ── Progression ──

  checkProgression(snapshot: DevelopmentalSnapshot): boolean {
    const trigger = SOCIAL_PROGRESSION_TRIGGERS.find(t => t.from === this.state.level);
    if (!trigger) return false;
    if (trigger.check(snapshot)) {
      this.advanceLevel(trigger.to);
      return true;
    }
    return false;
  }

  private advanceLevel(newLevel: number): void {
    this.currentLevel = SOCIAL_LEVELS[Math.min(newLevel, SOCIAL_LEVELS.length - 1)];
    this.state.level = this.currentLevel.level;
    this.levelHistory.push({ level: newLevel, tick: this.state.tick });
    this.state.characters = this.buildCharacters(this.currentLevel);
  }

  // ── Tick ──

  tick(): RawSensoryEvent[] {
    this.state.tick++;
    const events: RawSensoryEvent[] = [];
    const now = Date.now();

    // === CHARACTER PRESENCE ===
    for (const ch of this.state.characters) {
      if (ch.name === 'мама') {
        const wasPres = ch.present;
        ch.present = Math.random() < this.currentLevel.mamaPresence;
        if (!wasPres && ch.present) {
          events.push(this.event(`Мама пришла! Стало спокойнее.`, 'social_arrival', now));
        } else if (wasPres && !ch.present) {
          events.push(this.event(`Мама ушла. Стало тревожно...`, 'social_departure', now));
        }
      } else {
        // Other characters come and go
        if (!ch.present && Math.random() < 0.08) {
          ch.present = true;
          ch.action = 'пришёл';
          events.push(this.event(
            `${ch.name} пришёл! ${ch.name} — ${ch.mood}.`,
            'social_arrival', now,
          ));
        } else if (ch.present && Math.random() < 0.05) {
          ch.present = false;
          ch.action = 'ушёл';
          events.push(this.event(`${ch.name} ушёл. Стало тише.`, 'social_departure', now));
        }
      }
    }

    // === MOOD CHANGES ===
    if (Math.random() < this.currentLevel.moodVolatility) {
      const ch = pick(this.presentCharacters());
      if (ch) {
        const oldMood = ch.mood;
        ch.mood = pick(ALL_MOODS);
        if (oldMood !== ch.mood) {
          events.push(this.event(
            `${ch.name} стал ${ch.mood}. Раньше был ${oldMood}.`,
            'social_mood', now,
          ));
        }
      }
    }

    // === SPONTANEOUS SOCIAL EVENTS ===
    const present = this.presentCharacters();
    if (present.length > 0) {
      const r = Math.random();

      if (r < this.currentLevel.cooperationRate * 0.3) {
        // Cooperation event
        const ch = pick(present);
        const coopActions = [
          `${ch.name} делится игрушкой. Приятно!`,
          `${ch.name} помогает. Вместе легче!`,
          `${ch.name} предлагает играть вместе. Весело!`,
          `${ch.name} улыбается и протягивает руку.`,
        ];
        events.push(this.event(pick(coopActions), 'social_cooperation', now));
      } else if (r < this.currentLevel.cooperationRate * 0.3 + this.currentLevel.conflictRate * 0.3) {
        // Conflict event
        const ch = pick(present);
        const conflictActions = [
          `${ch.name} забрал игрушку! Обидно.`,
          `${ch.name} толкнул. Неприятно!`,
          `${ch.name} кричит. Страшно...`,
          `${ch.name} не хочет делиться. Грустно.`,
        ];
        events.push(this.event(pick(conflictActions), 'social_conflict', now));
      } else if (r < 0.4) {
        // Neutral observation
        const ch = pick(present);
        const props = CHARACTER_PROPERTIES[ch.name];
        const observations = [
          `${ch.name} ${ch.action}. ${ch.name} — ${props?.personality || ch.mood}.`,
          `${ch.name} рядом. Голос у ${ch.name} ${props?.voice || 'обычный'}.`,
          `Смотрю на ${ch.name}. ${ch.name} — ${props?.relation || ch.relation}.`,
        ];
        events.push(this.event(pick(observations), 'social_observe', now));
      }
    }

    // === CHILD ENERGY ===
    this.state.childEnergy -= 0.01;
    if (this.state.childEnergy < 0.2) {
      events.push(this.event('Устал от общения... Глазки закрываются...', 'internal', now));
      this.state.childEnergy = 1.0;
    }

    return events;
  }

  // ── Child Actions ──

  childAction(action: string, target?: string): RawSensoryEvent[] {
    const events: RawSensoryEvent[] = [];
    const now = Date.now();
    const ch = target
      ? this.state.characters.find(c => c.name === target && c.present)
      : pick(this.presentCharacters());

    if (!ch) {
      events.push(this.event('Никого нет рядом...', 'consequence', now));
      return events;
    }

    const props = CHARACTER_PROPERTIES[ch.name];

    switch (action) {
      case 'approach': {
        const friendly = ch.mood !== 'раздражённый' && ch.mood !== 'грустный';
        events.push(this.event(
          `Подошёл к ${ch.name}. ${friendly
            ? `${ch.name} улыбается! Приятно.`
            : `${ch.name} ${ch.mood}. Не хочет общаться.`}`,
          friendly ? 'social_positive' : 'social_neutral', now,
        ));
        if (friendly) ch.trustLevel = Math.min(1, ch.trustLevel + 0.05);
        break;
      }
      case 'share': {
        const accepts = ch.mood !== 'раздражённый';
        events.push(this.event(
          `Поделился с ${ch.name}. ${accepts
            ? `${ch.name} благодарит! "Спасибо!" Тепло на душе.`
            : `${ch.name} не взял. Обидно немного.`}`,
          accepts ? 'social_positive' : 'social_neutral', now,
        ));
        if (accepts) ch.trustLevel = Math.min(1, ch.trustLevel + 0.1);
        break;
      }
      case 'take': {
        const upset = ch.mood !== 'ласковый';
        events.push(this.event(
          `Забрал у ${ch.name}. ${upset
            ? `${ch.name} расстроился! "${ch.name} плачет." Плохо...`
            : `${ch.name} отдал спокойно. Но что-то не так...`}`,
          'social_negative', now,
        ));
        ch.trustLevel = Math.max(0, ch.trustLevel - 0.15);
        break;
      }
      case 'observe': {
        events.push(this.event(
          `Наблюдаю за ${ch.name}. ${ch.name} — ${props?.personality || 'обычный'}. ` +
          `Сейчас ${ch.mood}. ${props?.behavior || 'Стоит рядом'}.`,
          'social_observe', now,
        ));
        break;
      }
      case 'help': {
        const needsHelp = ch.mood === 'грустный' || ch.mood === 'уставший';
        events.push(this.event(
          `Помогаю ${ch.name}. ${needsHelp
            ? `${ch.name} благодарен! Стал ${pick(['весёлый', 'спокойный'])}. Очень приятно!`
            : `${ch.name} не нуждался в помощи, но улыбнулся.`}`,
          needsHelp ? 'social_very_positive' : 'social_positive', now,
        ));
        if (needsHelp) {
          ch.mood = 'весёлый';
          ch.trustLevel = Math.min(1, ch.trustLevel + 0.15);
        }
        break;
      }
      default: {
        events.push(this.event(
          `Что-то сделал рядом с ${ch.name}. ${ch.name} смотрит.`,
          'social_neutral', now,
        ));
      }
    }

    return events;
  }

  // ── Accessors (same interface as EvolvingWorld) ──

  getState(): SocialWorldState { return { ...this.state }; }
  getLevel(): number { return this.state.level; }
  getLevelHistory(): Array<{ level: number; tick: number }> { return [...this.levelHistory]; }
  getAvailableActions(): string[] { return ['approach', 'share', 'take', 'observe', 'help']; }
  getObjectNames(): string[] { return this.presentCharacters().map(c => c.name); }

  getGroundTruth(): Array<{ name: string; properties: Record<string, string> }> {
    return this.presentCharacters().map(ch => ({
      name: ch.name,
      properties: CHARACTER_PROPERTIES[ch.name] || {},
    }));
  }

  // ── Helpers ──

  private presentCharacters(): SocialCharacter[] {
    return this.state.characters.filter(c => c.present);
  }

  private event(content: string, source: string, timestamp: number): RawSensoryEvent {
    return {
      content,
      source,
      timestamp: timestamp + this.eventCounter++,
      byte_length: Buffer.byteLength(content, 'utf-8'),
    };
  }
}
