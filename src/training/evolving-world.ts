/**
 * EvolvingWorld: World that grows WITH the child.
 *
 * Not static — the world expands based on the child's developmental metrics.
 * Each level introduces new complexity, objects, locations, social dynamics.
 *
 * World Level 0: Single room, 5 objects, mama always present
 * World Level 1: Two rooms, 10 objects, mama sometimes absent
 * World Level 2: Three locations, 15 objects, weather changes, surprises
 * World Level 3: All locations, all objects, mama rare, social interactions
 * World Level 4: Novel objects introduced, physics exceptions
 *
 * Progression is triggered by the CHILD'S metrics, not by tick count.
 */

import { RawSensoryEvent } from '../kernel/sensory/modality.types';
import { DevelopmentalSnapshot } from '../kernel/developmental-metrics.service';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ═══════════════════════════════════════════
// WORLD LEVEL DEFINITIONS
// ═══════════════════════════════════════════

interface WorldLevel {
  level: number;
  locations: Array<{ name: string; objects: string[] }>;
  mamaPresence: number;       // 0-1 probability per tick
  mamaTeachingDepth: number;  // 0-3 (naming → describing → cause-effect → questions)
  weatherChanges: boolean;
  surpriseRate: number;       // 0-1
  socialInteractions: boolean;
  novelObjects: boolean;
}

const WORLD_LEVELS: WorldLevel[] = [
  {
    level: 0,
    locations: [
      { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла'] },
    ],
    mamaPresence: 1.0,
    mamaTeachingDepth: 1,    // just naming
    weatherChanges: false,
    surpriseRate: 0.02,
    socialInteractions: false,
    novelObjects: false,
  },
  {
    level: 1,
    locations: [
      { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла', 'машинка', 'пирамидка'] },
      { name: 'кухня', objects: ['тарелка', 'ложка', 'стакан', 'яблоко', 'хлеб', 'чашка'] },
    ],
    mamaPresence: 0.8,
    mamaTeachingDepth: 2,    // naming + describing
    weatherChanges: false,
    surpriseRate: 0.03,
    socialInteractions: false,
    novelObjects: false,
  },
  {
    level: 2,
    locations: [
      { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла', 'машинка', 'пирамидка'] },
      { name: 'кухня', objects: ['тарелка', 'ложка', 'стакан', 'яблоко', 'хлеб', 'чашка'] },
      { name: 'двор', objects: ['камень', 'палка', 'песок', 'лужа', 'листок', 'жук', 'цветок'] },
    ],
    mamaPresence: 0.6,
    mamaTeachingDepth: 3,    // + cause-effect
    weatherChanges: true,
    surpriseRate: 0.05,
    socialInteractions: false,
    novelObjects: false,
  },
  {
    level: 3,
    locations: [
      { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла', 'машинка', 'пирамидка'] },
      { name: 'кухня', objects: ['тарелка', 'ложка', 'стакан', 'яблоко', 'хлеб', 'чашка'] },
      { name: 'двор', objects: ['камень', 'палка', 'песок', 'лужа', 'листок', 'жук', 'цветок'] },
      { name: 'парк', objects: ['дерево', 'скамейка', 'голубь', 'собака', 'качели', 'горка'] },
      { name: 'ванная', objects: ['вода', 'мыло', 'полотенце', 'утка_резиновая', 'зеркало'] },
    ],
    mamaPresence: 0.3,
    mamaTeachingDepth: 3,
    weatherChanges: true,
    surpriseRate: 0.07,
    socialInteractions: true,
    novelObjects: false,
  },
  {
    level: 4,
    locations: [
      { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла', 'машинка', 'пирамидка'] },
      { name: 'кухня', objects: ['тарелка', 'ложка', 'стакан', 'яблоко', 'хлеб', 'чашка'] },
      { name: 'двор', objects: ['камень', 'палка', 'песок', 'лужа', 'листок', 'жук', 'цветок'] },
      { name: 'парк', objects: ['дерево', 'скамейка', 'голубь', 'собака', 'качели', 'горка'] },
      { name: 'ванная', objects: ['вода', 'мыло', 'полотенце', 'утка_резиновая', 'зеркало'] },
    ],
    mamaPresence: 0.15,
    mamaTeachingDepth: 3,
    weatherChanges: true,
    surpriseRate: 0.1,
    socialInteractions: true,
    novelObjects: true,
  },
];

// ═══════════════════════════════════════════
// PROGRESSION TRIGGERS
// ═══════════════════════════════════════════

interface ProgressionTrigger {
  from: number;
  to: number;
  check: (snap: DevelopmentalSnapshot) => boolean;
  description: string;
}

const PROGRESSION_TRIGGERS: ProgressionTrigger[] = [
  {
    from: 0, to: 1,
    check: (s) => s.world_model.property_accuracy > 0.4 && s.cognitive.concept_space_coverage > 0.1,
    description: 'accuracy > 40% AND coverage > 10%',
  },
  {
    from: 1, to: 2,
    check: (s) => s.world_model.property_accuracy > 0.5 && s.cognitive.abstraction_count >= 2,
    description: 'accuracy > 50% AND abstractions >= 2',
  },
  {
    from: 2, to: 3,
    check: (s) => s.world_model.property_accuracy > 0.6 && s.agency.explore_exploit_shift > 0,
    description: 'accuracy > 60% AND explore→exploit shift observed',
  },
  {
    from: 3, to: 4,
    check: (s) => s.world_model.property_accuracy > 0.7 && s.agency.help_seeking_frequency < 0.1,
    description: 'accuracy > 70% AND help-seeking < 10%',
  },
];

// ═══════════════════════════════════════════
// OBJECT DATABASE
// ═══════════════════════════════════════════

const OBJECT_DB: Record<string, Record<string, string>> = {
  мячик: { shape: 'круглый', color: 'красный', size: 'маленький', texture: 'гладкий', physics: 'катится и прыгает', sound: 'бум-бум' },
  кубик: { shape: 'квадратный', color: 'жёлтый', size: 'маленький', texture: 'твёрдый', physics: 'стоит ровно', sound: 'тук' },
  книжка: { shape: 'прямоугольная', color: 'яркая', size: 'средняя', texture: 'бумажная', physics: 'открывается', sound: 'шелест' },
  подушка: { shape: 'мягкая', color: 'белая', size: 'большая', texture: 'пушистая', physics: 'мнётся', sound: 'пуф' },
  кукла: { shape: 'как человечек', color: 'розовая', size: 'маленькая', texture: 'мягкая', physics: 'сидит', sound: 'тихо' },
  машинка: { shape: 'длинная', color: 'синяя', size: 'маленькая', texture: 'гладкая', physics: 'едет', sound: 'вжжж' },
  пирамидка: { shape: 'треугольная', color: 'разноцветная', size: 'средняя', texture: 'деревянная', physics: 'разбирается', sound: 'клац' },
  тарелка: { shape: 'круглая', color: 'белая', size: 'средняя', texture: 'гладкая', physics: 'разбивается', sound: 'дзынь' },
  ложка: { shape: 'длинная', color: 'серебристая', size: 'маленькая', texture: 'металлическая', physics: 'зачерпывает', sound: 'звяк' },
  стакан: { shape: 'высокий', color: 'прозрачный', size: 'средний', texture: 'стеклянный', physics: 'разбивается', sound: 'дзынь' },
  яблоко: { shape: 'круглое', color: 'красное', size: 'маленькое', texture: 'гладкое', physics: 'катится', sound: 'тихо' },
  хлеб: { shape: 'овальный', color: 'коричневый', size: 'средний', texture: 'мягкий', physics: 'крошится', sound: 'хруст' },
  чашка: { shape: 'круглая с ручкой', color: 'белая', size: 'маленькая', texture: 'керамическая', physics: 'наполняется', sound: 'буль-буль' },
  камень: { shape: 'неровный', color: 'серый', size: 'тяжёлый', texture: 'шершавый', physics: 'тонет в воде', sound: 'плюх' },
  палка: { shape: 'длинная', color: 'коричневая', size: 'лёгкая', texture: 'шершавая', physics: 'ломается', sound: 'хруст' },
  песок: { shape: 'сыпучий', color: 'жёлтый', size: 'мелкий', texture: 'шершавый', physics: 'сыпется', sound: 'шшш' },
  лужа: { shape: 'плоская', color: 'прозрачная', size: 'средняя', texture: 'мокрая', physics: 'брызгается', sound: 'плюх' },
  листок: { shape: 'плоский', color: 'зелёный', size: 'маленький', texture: 'мягкий', physics: 'летает', sound: 'шшш' },
  жук: { shape: 'маленький круглый', color: 'чёрный', size: 'крошечный', texture: 'твёрдый', physics: 'ползёт', sound: 'тихо' },
  цветок: { shape: 'красивый', color: 'красный', size: 'маленький', texture: 'мягкий', physics: 'качается', sound: 'тихо' },
  дерево: { shape: 'высокое', color: 'зелёное', size: 'огромное', texture: 'шершавое', physics: 'качается от ветра', sound: 'шшш' },
  собака: { shape: 'четвероногая', color: 'рыжая', size: 'большая', texture: 'пушистая', physics: 'бегает', sound: 'гав-гав' },
  голубь: { shape: 'птица', color: 'серый', size: 'маленький', texture: 'перьистый', physics: 'летает', sound: 'курлык' },
  качели: { shape: 'длинные', color: 'зелёные', size: 'большие', texture: 'металлические', physics: 'качаются', sound: 'скрип' },
  горка: { shape: 'наклонная', color: 'красная', size: 'большая', texture: 'гладкая', physics: 'скатываешься', sound: 'вжжж' },
  вода: { shape: 'жидкая', color: 'прозрачная', size: 'разная', texture: 'мокрая', physics: 'льётся', sound: 'буль-буль' },
  мыло: { shape: 'овальное', color: 'белое', size: 'маленькое', texture: 'скользкое', physics: 'пенится', sound: 'тихо' },
  полотенце: { shape: 'прямоугольное', color: 'белое', size: 'большое', texture: 'мягкое пушистое', physics: 'впитывает воду', sound: 'тихо' },
  утка_резиновая: { shape: 'в форме утки', color: 'жёлтая', size: 'маленькая', texture: 'резиновая мягкая', physics: 'плавает', sound: 'пик-пик' },
  зеркало: { shape: 'плоское', color: 'блестящее', size: 'большое', texture: 'гладкое', physics: 'отражает', sound: 'тихо' },
  скамейка: { shape: 'длинная', color: 'коричневая', size: 'большая', texture: 'деревянная', physics: 'стоит', sound: 'скрип' },
};

// Novel objects for Level 4 — things the child has NEVER seen
const NOVEL_OBJECTS: Record<string, Record<string, string>> = {
  магнит: { shape: 'маленький плоский', color: 'серый и красный', size: 'маленький', texture: 'гладкий металлический', physics: 'притягивает металл!', sound: 'клик' },
  пузыри: { shape: 'круглые прозрачные', color: 'радужные', size: 'разные', texture: 'невесомые', physics: 'лопаются!', sound: 'пуф' },
  пластилин: { shape: 'бесформенный', color: 'разноцветный', size: 'маленький', texture: 'мягкий липкий', physics: 'принимает любую форму', sound: 'тихо' },
  фонарик: { shape: 'длинный', color: 'чёрный', size: 'маленький', texture: 'пластиковый', physics: 'светит лучом!', sound: 'щёлк' },
  ледышка: { shape: 'неровная', color: 'прозрачная', size: 'маленькая', texture: 'холодная и скользкая', physics: 'тает в руках!', sound: 'кап-кап' },
};

// Social characters for Level 3+
const SOCIAL_CHARACTERS = [
  { name: 'Петя', relation: 'другой ребёнок', personality: 'шумный и весёлый' },
  { name: 'бабушка', relation: 'бабушка', personality: 'добрая и заботливая' },
  { name: 'котик', relation: 'домашнее животное', personality: 'независимый и пушистый' },
];

const WEATHER_STATES = ['солнечно и тепло', 'пасмурно', 'идёт дождь', 'идёт снег', 'ветрено', 'жарко'];
const TIME_STATES = ['утро', 'день', 'вечер'];
const MAMA_MOODS = ['ласковая', 'весёлая', 'спокойная', 'уставшая', 'игривая'];

interface WorldObject {
  name: string;
  nameRu: string;
  properties: Record<string, string>;
  position: string;
  state: string;
  isNovel: boolean;
}

interface WorldState {
  objects: WorldObject[];
  weather: string;
  timeOfDay: string;
  location: string;
  mamaPresent: boolean;
  mamaMood: string;
  childEnergy: number;
  tick: number;
  level: number;
}

export class EvolvingWorld {
  private state: WorldState;
  private eventCounter = 0;
  private currentLevel: WorldLevel;
  private novelObjectsIntroduced = new Set<string>();
  private levelHistory: Array<{ level: number; tick: number }> = [];

  constructor() {
    this.currentLevel = WORLD_LEVELS[0];
    const loc = this.currentLevel.locations[0];
    this.state = {
      objects: loc.objects.map(name => ({
        name, nameRu: name,
        properties: OBJECT_DB[name] || {},
        position: pick(['на полу', 'на столе', 'в руках', 'в углу', 'рядом']),
        state: 'обычный',
        isNovel: false,
      })),
      weather: 'солнечно и тепло',
      timeOfDay: 'утро',
      location: loc.name,
      mamaPresent: true,
      mamaMood: pick(MAMA_MOODS),
      childEnergy: 1.0,
      tick: 0,
      level: 0,
    };
    this.levelHistory.push({ level: 0, tick: 0 });
  }

  /**
   * Check if world should evolve based on child's developmental snapshot.
   * Returns true if level changed.
   */
  checkProgression(snapshot: DevelopmentalSnapshot): boolean {
    const trigger = PROGRESSION_TRIGGERS.find(t => t.from === this.state.level);
    if (!trigger) return false;

    if (trigger.check(snapshot)) {
      this.advanceLevel(trigger.to);
      return true;
    }
    return false;
  }

  private advanceLevel(newLevel: number): void {
    this.currentLevel = WORLD_LEVELS[Math.min(newLevel, WORLD_LEVELS.length - 1)];
    this.state.level = this.currentLevel.level;
    this.levelHistory.push({ level: newLevel, tick: this.state.tick });

    // Move to a random location from the new level
    const loc = pick(this.currentLevel.locations);
    this.state.location = loc.name;
    this.state.objects = loc.objects.map(name => ({
      name, nameRu: name,
      properties: OBJECT_DB[name] || {},
      position: pick(['на полу', 'на столе', 'в руках', 'рядом']),
      state: 'обычный',
      isNovel: false,
    }));
  }

  /**
   * Advance world by one tick. Returns events from all streams.
   */
  tick(): RawSensoryEvent[] {
    this.state.tick++;
    const events: RawSensoryEvent[] = [];
    const now = Date.now();

    // === AMBIENT ===
    if (this.currentLevel.weatherChanges && this.state.tick % 20 === 0) {
      this.state.weather = pick(WEATHER_STATES);
      events.push(this.event(`На улице ${this.state.weather}.`, 'ambient', now));
    }
    if (this.state.tick % 50 === 0) {
      this.state.timeOfDay = pick(TIME_STATES);
      events.push(this.event(`Сейчас ${this.state.timeOfDay}.`, 'ambient', now));
    }

    // Location change (frequency depends on level)
    const locationChangeFreq = 30 + (4 - this.currentLevel.level) * 15;
    if (this.state.tick % locationChangeFreq === 0 && this.currentLevel.locations.length > 1) {
      const loc = pick(this.currentLevel.locations);
      if (loc.name !== this.state.location) {
        this.state.location = loc.name;
        this.state.objects = loc.objects.map(name => ({
          name, nameRu: name,
          properties: OBJECT_DB[name] || {},
          position: pick(['на полу', 'на столе', 'в руках', 'рядом']),
          state: 'обычный',
          isNovel: false,
        }));
        events.push(this.event(`Мы пришли в ${loc.name}.`, 'ambient', now));
      }
    }

    // === NOVEL OBJECTS (Level 4) ===
    if (this.currentLevel.novelObjects && Math.random() < 0.03) {
      const available = Object.keys(NOVEL_OBJECTS).filter(n => !this.novelObjectsIntroduced.has(n));
      if (available.length > 0) {
        const novelName = pick(available);
        this.novelObjectsIntroduced.add(novelName);
        const props = NOVEL_OBJECTS[novelName];
        this.state.objects.push({
          name: novelName, nameRu: novelName,
          properties: props,
          position: 'появился!',
          state: 'новый',
          isNovel: true,
        });
        events.push(this.event(
          `Что-то новое! ${novelName}! Никогда такого не видел...`,
          'surprise', now,
        ));
      }
    }

    // === OBJECT INTERACTIONS ===
    if (Math.random() < 0.7 && this.state.objects.length > 0) {
      const obj = pick(this.state.objects);
      const events2 = this.generateObjectEvent(obj, now);
      events.push(...events2);
    }

    // === MAMA ===
    this.state.mamaPresent = Math.random() < this.currentLevel.mamaPresence;
    if (this.state.mamaPresent) {
      const mamaEvents = this.generateMamaEvent(now);
      events.push(...mamaEvents);
    }

    // === SOCIAL (Level 3+) ===
    if (this.currentLevel.socialInteractions && Math.random() < 0.15) {
      const character = pick(SOCIAL_CHARACTERS);
      events.push(...this.generateSocialEvent(character, now));
    }

    // === CHILD ENERGY ===
    this.state.childEnergy -= 0.01;
    if (this.state.childEnergy < 0.2) {
      events.push(this.event('Устал... Глазки закрываются...', 'internal', now));
      this.state.childEnergy = 1.0;
      this.state.mamaMood = pick(MAMA_MOODS);
    }

    // === SURPRISES ===
    if (Math.random() < this.currentLevel.surpriseRate) {
      events.push(this.event(pick(this.getSurprises()), 'surprise', now));
    }

    return events;
  }

  private generateObjectEvent(obj: WorldObject, now: number): RawSensoryEvent[] {
    const events: RawSensoryEvent[] = [];
    const r = Math.random();

    if (r < 0.3) {
      events.push(this.event(
        `${obj.position} лежит ${obj.nameRu}. Он ${obj.properties.color || ''} и ${obj.properties.shape || ''}.`,
        'object', now,
      ));
    } else if (r < 0.5) {
      events.push(this.event(
        `Потрогал ${obj.nameRu}. Он ${obj.properties.texture || 'обычный'} на ощупь.`,
        'touch', now,
      ));
    } else if (r < 0.7) {
      events.push(this.event(
        `Толкнул ${obj.nameRu}. ${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} ${obj.properties.physics || 'не двигается'}.`,
        'physics', now,
      ));
    } else if (r < 0.85) {
      events.push(this.event(
        `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} издаёт звук: ${obj.properties.sound || 'тихо'}.`,
        'sound', now,
      ));
    } else {
      const other = pick(this.state.objects.filter(o => o.name !== obj.name));
      if (other) {
        const sameShape = obj.properties.shape === other.properties.shape;
        events.push(this.event(
          `${obj.nameRu} и ${other.nameRu}. ${sameShape ? 'Они похожи по форме!' : 'Они разной формы.'}`,
          'comparison', now,
        ));
      }
    }

    // Novel objects get extra curiosity trigger
    if (obj.isNovel && Math.random() < 0.5) {
      events.push(this.event(
        `${obj.nameRu} — странный! Что с ним будет если...?`,
        'internal', now,
      ));
    }

    return events;
  }

  private generateMamaEvent(now: number): RawSensoryEvent[] {
    const events: RawSensoryEvent[] = [];
    const obj = this.state.objects.length > 0 ? pick(this.state.objects) : null;
    const depth = this.currentLevel.mamaTeachingDepth;
    const r = Math.random();

    if (r < 0.2 && obj && depth >= 1) {
      // Naming
      events.push(this.event(`Мама говорит: "Это ${obj.nameRu}!"`, 'mama_speech', now));
    } else if (r < 0.35 && obj && depth >= 2) {
      // Describing
      events.push(this.event(
        `Мама говорит: "${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} ${obj.properties.color || ''}, ${obj.properties.shape || ''}."`,
        'mama_speech', now,
      ));
    } else if (r < 0.5 && obj && depth >= 3) {
      // Cause-effect
      events.push(this.event(
        `Мама объясняет: "Если уронить ${obj.nameRu}, он ${obj.properties.physics || 'упадёт'}."`,
        'mama_teaching', now,
      ));
    } else if (r < 0.6) {
      // Emotional
      const phrases = [
        'Мама улыбается: "Молодец!"',
        'Мама говорит: "Осторожно!"',
        'Мама обнимает.',
        'Мама смеётся.',
        `Мама ${this.state.mamaMood}: "Как хорошо!"`,
        'Мама хвалит: "Умница!"',
      ];
      events.push(this.event(pick(phrases), 'mama_emotion', now));
    } else if (r < 0.75 && obj && depth >= 3) {
      // Question (prompting the child to think)
      events.push(this.event(
        `Мама спрашивает: "Где ${obj.nameRu}? Какого он цвета?"`,
        'mama_question', now,
      ));
    } else {
      const routines = [
        'Мама говорит: "Пора кушать."',
        'Мама говорит: "Идём гулять!"',
        'Мама говорит: "Пора спать."',
        'Мама поёт песенку.',
      ];
      events.push(this.event(pick(routines), 'mama_routine', now));
    }

    return events;
  }

  private generateSocialEvent(character: typeof SOCIAL_CHARACTERS[0], now: number): RawSensoryEvent[] {
    const events: RawSensoryEvent[] = [];
    const r = Math.random();

    if (r < 0.3) {
      events.push(this.event(
        `${character.name} пришёл! ${character.name} — ${character.personality}.`,
        'social', now,
      ));
    } else if (r < 0.5 && this.state.objects.length > 0) {
      const obj = pick(this.state.objects);
      events.push(this.event(
        `${character.name} взял ${obj.nameRu}. "${character.name}, отдай!"`,
        'social_conflict', now,
      ));
    } else if (r < 0.7) {
      events.push(this.event(
        `${character.name} играет рядом. Весело вместе!`,
        'social_positive', now,
      ));
    } else {
      events.push(this.event(
        `${character.name} ушёл. Стало тихо.`,
        'social', now,
      ));
    }

    return events;
  }

  private getSurprises(): string[] {
    const base = [
      'Кошка прыгнула на стол!',
      'За окном проехала машина: бибип!',
      'Зазвонил телефон: дзынь-дзынь!',
      'Птичка села на подоконник.',
      'На пол упала игрушка: бах!',
    ];
    if (this.currentLevel.level >= 2) {
      base.push(
        'Дождь начался! Кап-кап по окну.',
        'Гром! Бабах! Страшно...',
        'Радуга! Красиво...',
      );
    }
    if (this.currentLevel.level >= 3) {
      base.push(
        'Незнакомый дядя зашёл. Кто это?',
        'Музыка из соседней комнаты!',
        'Свет погас! Темно! Потом включился.',
      );
    }
    if (this.currentLevel.level >= 4) {
      base.push(
        'Предмет повёл себя не так как ожидалось!',
        'Два предмета соединились!',
        'Что-то исчезло и появилось в другом месте!',
      );
    }
    return base;
  }

  /**
   * Child ACTS on the world. Returns consequences as events.
   */
  childAction(action: string, targetObject?: string): RawSensoryEvent[] {
    const events: RawSensoryEvent[] = [];
    const now = Date.now();
    const obj = targetObject
      ? this.state.objects.find(o => o.nameRu === targetObject)
      : this.state.objects.length > 0 ? pick(this.state.objects) : null;

    if (!obj) {
      events.push(this.event('Ничего не произошло — нечего трогать.', 'consequence', now));
      return events;
    }

    const props = obj.properties;

    switch (action) {
      case 'touch': {
        events.push(this.event(
          `Потрогал ${obj.nameRu}. На ощупь: ${props.texture || 'обычный'}.`,
          'touch_result', now,
        ));
        break;
      }
      case 'push': {
        const isRound = (props.shape || '').includes('кругл');
        const rolls = isRound || (props.physics || '').includes('катится');
        events.push(this.event(
          `Толкнул ${obj.nameRu}. ${rolls ? `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} покатился!` : `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} не покатился.`}`,
          'physics_result', now,
        ));
        break;
      }
      case 'drop': {
        const fragile = (props.texture || '').includes('стеклян') || (props.physics || '').includes('разбивается');
        events.push(this.event(
          `Уронил ${obj.nameRu}. ${fragile ? 'Разбился! Дзынь!' : `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} упал, но цел.`}`,
          'physics_result', now,
        ));
        if (fragile && this.state.mamaPresent) {
          events.push(this.event('Мама расстроена. "Не бросай вещи!"', 'mama_emotion', now));
        }
        break;
      }
      case 'shake': {
        events.push(this.event(
          `Потряс ${obj.nameRu}. Звук: ${props.sound || 'тихо'}.`,
          'sound_result', now,
        ));
        break;
      }
      case 'look_closely': {
        events.push(this.event(
          `Разглядываю ${obj.nameRu} вблизи. Цвет: ${props.color || '?'}. Форма: ${props.shape || '?'}. Размер: ${props.size || '?'}.`,
          'visual_detail', now,
        ));
        break;
      }
      case 'put_in_water': {
        const heavy = (props.size || '').includes('тяжёл') || (props.texture || '').includes('метал') || obj.nameRu === 'камень';
        events.push(this.event(
          `Положил ${obj.nameRu} в воду. ${heavy ? 'Утонул! Тяжёлый.' : 'Плавает! Лёгкий.'}`,
          'physics_result', now,
        ));
        break;
      }
      default: {
        events.push(this.event(
          `Сделал что-то с ${obj.nameRu}. ${props.physics || 'Ничего особенного.'}`,
          'consequence', now,
        ));
      }
    }

    return events;
  }

  getState(): WorldState { return { ...this.state }; }
  getLevel(): number { return this.state.level; }
  getLevelHistory(): Array<{ level: number; tick: number }> { return [...this.levelHistory]; }
  getAvailableActions(): string[] { return ['touch', 'push', 'drop', 'shake', 'look_closely', 'put_in_water']; }
  getObjectNames(): string[] { return this.state.objects.map(o => o.nameRu); }

  getGroundTruth(): Array<{ name: string; properties: Record<string, string> }> {
    return this.state.objects.map(obj => ({
      name: obj.nameRu,
      properties: obj.properties,
    }));
  }

  private event(content: string, source: string, timestamp: number): RawSensoryEvent {
    return { content, source, timestamp: timestamp + this.eventCounter++, byte_length: Buffer.byteLength(content, 'utf-8') };
  }
}
