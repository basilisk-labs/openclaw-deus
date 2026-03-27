/**
 * VirtualWorld: A sandbox where the child LIVES.
 *
 * Not lessons — EXPERIENCE. The world has objects with physics,
 * a mama who talks, weather that changes, consequences that follow actions.
 *
 * The world generates RawSensoryEvents from multiple sources:
 * - Object presence → "there is a ball on the floor"
 * - Physics → "the ball rolled when pushed"
 * - Mama speech → "мячик! круглый!"
 * - Ambient → "it's sunny", "it's cold"
 * - Consequence → "the glass broke when it fell"
 *
 * Modality discovery happens naturally: these streams have
 * different statistical textures.
 */

import { RawSensoryEvent } from '../kernel/sensory/modality.types';

interface WorldObject {
  name: string;
  nameRu: string;
  properties: Record<string, string>;
  position: string;
  state: string;
}

interface WorldState {
  objects: WorldObject[];
  weather: string;
  timeOfDay: string;
  location: string;
  mamaPresent: boolean;
  mamaMood: string;
  childEnergy: number; // 0-1
  tick: number;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const LOCATIONS = [
  { name: 'детская комната', objects: ['мячик', 'кубик', 'книжка', 'подушка', 'кукла', 'машинка', 'пирамидка'] },
  { name: 'кухня', objects: ['тарелка', 'ложка', 'стакан', 'яблоко', 'хлеб', 'чашка'] },
  { name: 'двор', objects: ['камень', 'палка', 'песок', 'лужа', 'листок', 'жук', 'цветок'] },
  { name: 'парк', objects: ['дерево', 'скамейка', 'голубь', 'собака', 'качели', 'горка'] },
  { name: 'ванная', objects: ['вода', 'мыло', 'полотенце', 'утка_резиновая', 'зеркало'] },
];

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

const WEATHER_STATES = ['солнечно и тепло', 'пасмурно', 'идёт дождь', 'идёт снег', 'ветрено', 'жарко'];
const TIME_STATES = ['утро', 'день', 'вечер'];
const MAMA_MOODS = ['ласковая', 'весёлая', 'спокойная', 'уставшая', 'игривая'];

export class VirtualWorld {
  private state: WorldState;
  private eventCounter = 0;

  constructor() {
    const loc = pick(LOCATIONS);
    this.state = {
      objects: loc.objects.map(name => ({
        name,
        nameRu: name,
        properties: OBJECT_DB[name] || {},
        position: pick(['на полу', 'на столе', 'в руках', 'в углу', 'рядом']),
        state: 'обычный',
      })),
      weather: pick(WEATHER_STATES),
      timeOfDay: 'утро',
      location: loc.name,
      mamaPresent: true,
      mamaMood: pick(MAMA_MOODS),
      childEnergy: 1.0,
      tick: 0,
    };
  }

  /**
   * Advance world by one tick. Returns events from all streams.
   * Each tick ≈ a few seconds of lived experience.
   */
  tick(): RawSensoryEvent[] {
    this.state.tick++;
    const events: RawSensoryEvent[] = [];
    const now = Date.now();

    // === AMBIENT: weather, time, location ===
    if (this.state.tick % 20 === 0) {
      this.state.weather = pick(WEATHER_STATES);
      events.push(this.event(`На улице ${this.state.weather}.`, 'ambient', now));
    }
    if (this.state.tick % 50 === 0) {
      this.state.timeOfDay = pick(TIME_STATES);
      events.push(this.event(`Сейчас ${this.state.timeOfDay}.`, 'ambient', now));
    }
    if (this.state.tick % 30 === 0) {
      const loc = pick(LOCATIONS);
      this.state.location = loc.name;
      this.state.objects = loc.objects.map(name => ({
        name, nameRu: name, properties: OBJECT_DB[name] || {},
        position: pick(['на полу', 'на столе', 'в руках', 'рядом']),
        state: 'обычный',
      }));
      events.push(this.event(`Мы пришли в ${loc.name}.`, 'ambient', now));
    }

    // === OBJECT: random object interaction ===
    if (Math.random() < 0.7 && this.state.objects.length > 0) {
      const obj = pick(this.state.objects);
      const interactionType = Math.random();

      if (interactionType < 0.3) {
        // SEE object
        events.push(this.event(
          `${obj.position} лежит ${obj.nameRu}. Он ${obj.properties.color || ''} и ${obj.properties.shape || ''}.`,
          'object', now,
        ));
      } else if (interactionType < 0.5) {
        // TOUCH object
        events.push(this.event(
          `Потрогал ${obj.nameRu}. Он ${obj.properties.texture || 'обычный'} на ощупь.`,
          'touch', now,
        ));
      } else if (interactionType < 0.7) {
        // PUSH/INTERACT
        events.push(this.event(
          `Толкнул ${obj.nameRu}. ${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} ${obj.properties.physics || 'не двигается'}.`,
          'physics', now,
        ));
      } else if (interactionType < 0.85) {
        // HEAR
        events.push(this.event(
          `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} издаёт звук: ${obj.properties.sound || 'тихо'}.`,
          'sound', now,
        ));
      } else {
        // COMPARE with another
        const other = pick(this.state.objects.filter(o => o.name !== obj.name));
        if (other) {
          const sameShape = obj.properties.shape === other.properties.shape;
          events.push(this.event(
            `${obj.nameRu} и ${other.nameRu}. ${sameShape ? 'Они похожи по форме!' : 'Они разной формы.'}`,
            'comparison', now,
          ));
        }
      }
    }

    // === MAMA: speech, emotional, teaching ===
    if (this.state.mamaPresent && Math.random() < 0.6) {
      const obj = this.state.objects.length > 0 ? pick(this.state.objects) : null;
      const mamaType = Math.random();

      if (mamaType < 0.25 && obj) {
        // NAMING
        events.push(this.event(`Мама говорит: "Это ${obj.nameRu}!"`, 'mama_speech', now));
      } else if (mamaType < 0.4 && obj) {
        // DESCRIBING
        events.push(this.event(
          `Мама говорит: "${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} ${obj.properties.color || ''}, ${obj.properties.shape || ''}."`,
          'mama_speech', now,
        ));
      } else if (mamaType < 0.55) {
        // EMOTIONAL
        const phrases = [
          'Мама улыбается: "Молодец!"',
          'Мама говорит: "Осторожно!"',
          'Мама обнимает.',
          'Мама смеётся.',
          `Мама ${this.state.mamaMood}: "Как хорошо!"`,
          'Мама говорит: "Не трогай это!"',
          'Мама хвалит: "Умница!"',
        ];
        events.push(this.event(pick(phrases), 'mama_emotion', now));
      } else if (mamaType < 0.7 && obj) {
        // CAUSE-EFFECT
        events.push(this.event(
          `Мама объясняет: "Если уронить ${obj.nameRu}, он ${obj.properties.physics || 'упадёт'}."`,
          'mama_teaching', now,
        ));
      } else if (mamaType < 0.85 && obj) {
        // QUESTION
        events.push(this.event(
          `Мама спрашивает: "Где ${obj.nameRu}? Какого он цвета?"`,
          'mama_question', now,
        ));
      } else {
        // ROUTINE
        const routines = [
          'Мама говорит: "Пора кушать."',
          'Мама говорит: "Идём гулять!"',
          'Мама говорит: "Пора спать."',
          'Мама говорит: "Помой ручки."',
          'Мама поёт песенку.',
        ];
        events.push(this.event(pick(routines), 'mama_routine', now));
      }
    }

    // === CHILD ENERGY ===
    this.state.childEnergy -= 0.01;
    if (this.state.childEnergy < 0.2) {
      events.push(this.event('Устал... Глазки закрываются...', 'internal', now));
      this.state.childEnergy = 1.0; // "slept"
      this.state.mamaMood = pick(MAMA_MOODS);
    }

    // === SURPRISES (rare) ===
    if (Math.random() < 0.05) {
      const surprises = [
        'Кошка прыгнула на стол!',
        'За окном проехала машина: бибип!',
        'Зазвонил телефон: дзынь-дзынь!',
        'Птичка села на подоконник.',
        'Дождь начался! Кап-кап по окну.',
        'Собака залаяла за дверью: гав-гав!',
        'Свет мигнул и погас на секунду.',
        'На пол упала игрушка: бах!',
      ];
      events.push(this.event(pick(surprises), 'surprise', now));
    }

    return events;
  }

  getState(): WorldState { return { ...this.state }; }

  /**
   * Child ACTS on the world. Returns consequences as events.
   * The child is not passive — it explores, tests, manipulates.
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
          `Толкнул ${obj.nameRu}. ${rolls ? `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} покатился!` : `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} не покатился. Просто сдвинулся.`}`,
          'physics_result', now,
        ));
        break;
      }

      case 'drop': {
        const fragile = (props.texture || '').includes('стеклян') || (props.physics || '').includes('разбивается');
        events.push(this.event(
          `Уронил ${obj.nameRu}. ${fragile ? 'Разбился! Дзынь! Мама: "Осторожнее!"' : `${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} упал, но цел.`}`,
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

  /**
   * GROUND TRUTH: what the world actually knows about objects.
   * Used for verification — does the child's model match reality?
   */
  getGroundTruth(): Array<{ name: string; properties: Record<string, string> }> {
    return this.state.objects.map(obj => ({
      name: obj.nameRu,
      properties: obj.properties,
    }));
  }

  /** Get available actions for exploration. */
  getAvailableActions(): string[] {
    return ['touch', 'push', 'drop', 'shake', 'look_closely', 'put_in_water'];
  }

  /** Get object names in current location. */
  getObjectNames(): string[] {
    return this.state.objects.map(o => o.nameRu);
  }

  private event(content: string, source: string, timestamp: number): RawSensoryEvent {
    return { content, source, timestamp: timestamp + this.eventCounter++, byte_length: Buffer.byteLength(content, 'utf-8') };
  }
}
