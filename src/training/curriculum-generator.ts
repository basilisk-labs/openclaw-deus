/**
 * Generate 1000+ natural childhood lessons.
 * NOT templates — varied, progressive, multi-domain.
 *
 * A child learns through:
 * - Repeated encounters with objects in different contexts
 * - Actions and their consequences
 * - Cause and effect ("because")
 * - Corrections ("нет, это не так")
 * - Questions and answers
 * - Emotional coloring ("осторожно!", "молодец!")
 * - Spatial relations
 * - Quantities and comparison
 * - Time sequences
 * - Categories emerging from instances
 * - Exceptions to rules
 */

interface Lesson {
  text: string;
  domain: string;
  complexity: number; // 1-5
}

// Object properties database
const OBJECTS: Record<string, Record<string, string[]>> = {
  мячик: { shape: ['круглый'], color: ['красный', 'синий', 'зелёный'], size: ['маленький'], texture: ['гладкий', 'мягкий'], action: ['катится', 'прыгает', 'летит'] },
  кубик: { shape: ['квадратный'], color: ['жёлтый', 'красный', 'синий'], size: ['маленький'], texture: ['твёрдый', 'гладкий'], action: ['стоит', 'падает', 'строится в башню'] },
  тарелка: { shape: ['круглая'], color: ['белая', 'синяя'], size: ['большая', 'маленькая'], texture: ['гладкая', 'твёрдая'], action: ['стоит на столе', 'разбивается'] },
  книжка: { shape: ['прямоугольная'], color: ['разноцветная'], size: ['большая', 'маленькая'], texture: ['бумажная', 'мягкая'], action: ['открывается', 'закрывается'] },
  яблоко: { shape: ['круглое'], color: ['красное', 'зелёное'], size: ['маленькое'], texture: ['гладкое', 'твёрдое'], action: ['падает с дерева', 'катится'] },
  коробка: { shape: ['квадратная', 'прямоугольная'], color: ['коричневая'], size: ['большая', 'маленькая'], texture: ['картонная'], action: ['открывается', 'закрывается'] },
  монетка: { shape: ['круглая'], color: ['жёлтая', 'серебристая'], size: ['маленькая'], texture: ['гладкая', 'твёрдая', 'блестящая'], action: ['катится', 'звенит'] },
  кирпич: { shape: ['прямоугольный'], color: ['красный', 'серый'], size: ['тяжёлый', 'большой'], texture: ['шершавый', 'твёрдый'], action: ['лежит', 'не катится'] },
  мяч: { shape: ['круглый'], color: ['белый', 'чёрный'], size: ['большой'], texture: ['кожаный'], action: ['катится', 'прыгает', 'летит'] },
  стакан: { shape: ['цилиндрический'], color: ['прозрачный'], size: ['высокий'], texture: ['гладкий', 'стеклянный'], action: ['стоит', 'разбивается', 'наполняется'] },
  ложка: { shape: ['длинная', 'изогнутая'], color: ['серебристая'], size: ['маленькая'], texture: ['гладкая', 'металлическая'], action: ['зачерпывает', 'звенит'] },
  подушка: { shape: ['прямоугольная', 'квадратная'], color: ['белая', 'цветная'], size: ['мягкая', 'большая'], texture: ['мягкая', 'пушистая'], action: ['мнётся', 'не падает быстро'] },
  камень: { shape: ['неровный', 'округлый'], color: ['серый', 'тёмный'], size: ['тяжёлый'], texture: ['твёрдый', 'шершавый', 'холодный'], action: ['лежит', 'тонет в воде'] },
  бумага: { shape: ['тонкая', 'плоская'], color: ['белая'], size: ['лёгкая'], texture: ['гладкая', 'тонкая'], action: ['рвётся', 'мнётся', 'летает'] },
  вода: { shape: ['принимает форму сосуда'], color: ['прозрачная'], size: ['разная'], texture: ['мокрая', 'жидкая'], action: ['льётся', 'течёт', 'замерзает'] },
  снег: { shape: ['рыхлый'], color: ['белый'], size: ['лёгкий'], texture: ['холодный', 'мокрый'], action: ['тает', 'падает', 'лепится'] },
  песок: { shape: ['сыпучий'], color: ['жёлтый', 'серый'], size: ['мелкий'], texture: ['шершавый', 'сухой'], action: ['сыпется', 'лепится когда мокрый'] },
  дерево: { shape: ['высокое', 'толстое'], color: ['коричневое', 'зелёное'], size: ['большое'], texture: ['шершавое', 'твёрдое'], action: ['растёт', 'качается от ветра'] },
  цветок: { shape: ['маленький', 'красивый'], color: ['красный', 'жёлтый', 'белый'], size: ['маленький'], texture: ['мягкий', 'нежный'], action: ['растёт', 'пахнет', 'вянет'] },
  солнце: { shape: ['круглое'], color: ['жёлтое', 'яркое'], size: ['огромное'], texture: ['горячее'], action: ['светит', 'греет', 'встаёт и садится'] },
};

const ANIMALS = ['кошка', 'собака', 'птичка', 'рыбка', 'бабочка', 'муравей', 'лягушка', 'ёжик'];
const ANIMAL_PROPS: Record<string, string[]> = {
  кошка: ['мягкая', 'пушистая', 'мурлычет', 'ловит мышей', 'живёт дома', 'у неё четыре лапы'],
  собака: ['верная', 'лает', 'бегает быстро', 'виляет хвостом', 'живёт дома', 'у неё четыре лапы'],
  птичка: ['маленькая', 'летает', 'поёт', 'у неё крылья', 'живёт на дереве', 'клюёт зёрнышки'],
  рыбка: ['плавает', 'живёт в воде', 'молчит', 'скользкая', 'у неё плавники', 'не может ходить'],
  бабочка: ['красивая', 'летает', 'садится на цветы', 'у неё крылья', 'была гусеницей'],
  муравей: ['маленький', 'сильный', 'живёт в муравейнике', 'трудолюбивый', 'ходит строем'],
  лягушка: ['зелёная', 'прыгает', 'квакает', 'живёт у воды', 'ловит мух'],
  ёжик: ['колючий', 'сворачивается в клубок', 'фыркает', 'ест яблоки', 'ходит ночью'],
};

const EMOTIONS = ['радостно', 'грустно', 'страшно', 'интересно', 'весело', 'скучно', 'удивительно'];
const WEATHER = ['солнечно', 'дождь', 'снег', 'ветер', 'облачно', 'гроза', 'туман'];
const PLACES = ['дома', 'на улице', 'в парке', 'в магазине', 'в лесу', 'у реки', 'в садике'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickProp(obj: string, prop: string): string {
  const props = OBJECTS[obj]?.[prop];
  return props ? pick(props) : '';
}

export function generateCurriculum(count = 1000): Lesson[] {
  const lessons: Lesson[] = [];

  // === PHASE 1: Simple objects (200 lessons, complexity 1) ===
  const objects = Object.keys(OBJECTS);
  for (let i = 0; i < 200 && lessons.length < count; i++) {
    const obj = pick(objects);
    const templates = [
      `Вот ${obj}. ${obj.charAt(0).toUpperCase() + obj.slice(1)} ${pickProp(obj, 'shape')}.`,
      `Смотри, ${obj}! Он ${pickProp(obj, 'color')}.`,
      `Это ${obj}. Потрогай — он ${pickProp(obj, 'texture')}.`,
      `${obj.charAt(0).toUpperCase() + obj.slice(1)} ${pickProp(obj, 'action')}.`,
      `Где ${obj}? Вот он! ${obj.charAt(0).toUpperCase() + obj.slice(1)} ${pickProp(obj, 'size')}.`,
      `Какой ${obj}? ${obj.charAt(0).toUpperCase() + obj.slice(1)} ${pickProp(obj, 'color')} и ${pickProp(obj, 'texture')}.`,
      `${obj.charAt(0).toUpperCase() + obj.slice(1)} — это предмет. Он ${pickProp(obj, 'texture')}.`,
    ];
    lessons.push({ text: pick(templates), domain: 'objects', complexity: 1 });
  }

  // === PHASE 2: Actions and consequences (150 lessons, complexity 2) ===
  for (let i = 0; i < 150 && lessons.length < count; i++) {
    const obj = pick(objects);
    const templates = [
      `Если уронить ${obj}, он ${pickProp(obj, 'texture') === 'мягкий' || pickProp(obj, 'texture') === 'мягкая' ? 'не разобьётся' : 'может разбиться'}.`,
      `${obj.charAt(0).toUpperCase() + obj.slice(1)} ${pickProp(obj, 'action')}. Это потому что он ${pickProp(obj, 'shape')}.`,
      `Нельзя бросать ${obj}! ${pickProp(obj, 'texture') === 'стеклянный' ? 'Он разобьётся.' : 'Осторожно!'}`,
      `Что будет если толкнуть ${obj}? Он ${pickProp(obj, 'shape') === 'круглый' || pickProp(obj, 'shape') === 'круглая' || pickProp(obj, 'shape') === 'круглое' ? 'покатится' : 'упадёт'}.`,
      `${obj.charAt(0).toUpperCase() + obj.slice(1)} тяжёлый? ${pickProp(obj, 'size') === 'тяжёлый' ? 'Да, очень.' : 'Нет, лёгкий.'}`,
      `Попробуй поднять ${obj}. ${pickProp(obj, 'size') === 'тяжёлый' ? 'Тяжело!' : 'Легко!'}`,
    ];
    lessons.push({ text: pick(templates), domain: 'actions', complexity: 2 });
  }

  // === PHASE 3: Animals (100 lessons, complexity 2) ===
  for (let i = 0; i < 100 && lessons.length < count; i++) {
    const animal = pick(ANIMALS);
    const props = ANIMAL_PROPS[animal] || [];
    const templates = [
      `Смотри, ${animal}! ${animal.charAt(0).toUpperCase() + animal.slice(1)} ${pick(props)}.`,
      `${animal.charAt(0).toUpperCase() + animal.slice(1)} — это животное. Она ${pick(props)}.`,
      `Как делает ${animal}? ${animal.charAt(0).toUpperCase() + animal.slice(1)} ${pick(props)}.`,
      `У ${animal} есть ${pick(['глаза', 'лапы', 'хвост', 'уши'])}. ${animal.charAt(0).toUpperCase() + animal.slice(1)} ${pick(props)}.`,
      `${animal.charAt(0).toUpperCase() + animal.slice(1)} живая. Она дышит, ест и ${pick(props)}.`,
    ];
    lessons.push({ text: pick(templates), domain: 'animals', complexity: 2 });
  }

  // === PHASE 4: Spatial relations (100 lessons, complexity 2) ===
  for (let i = 0; i < 100 && lessons.length < count; i++) {
    const obj1 = pick(objects);
    const obj2 = pick(objects.filter(o => o !== obj1));
    const relations = ['на', 'под', 'рядом с', 'за', 'перед', 'внутри', 'снаружи', 'далеко от', 'близко к'];
    const rel = pick(relations);
    const templates = [
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} ${rel} ${obj2}.`,
      `Положи ${obj1} ${rel} ${obj2}.`,
      `Где ${obj1}? ${obj1.charAt(0).toUpperCase() + obj1.slice(1)} ${rel} ${obj2}.`,
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} стоит ${rel} ${obj2}. Видишь?`,
    ];
    lessons.push({ text: pick(templates), domain: 'spatial', complexity: 2 });
  }

  // === PHASE 5: Quantities and comparison (100 lessons, complexity 3) ===
  for (let i = 0; i < 100 && lessons.length < count; i++) {
    const obj1 = pick(objects);
    const obj2 = pick(objects.filter(o => o !== obj1));
    const templates = [
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} больше чем ${obj2}.`,
      `Что тяжелее — ${obj1} или ${obj2}?`,
      `Один ${obj1}, два ${obj1}а, много ${obj1}ов.`,
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} и ${obj2} — это два предмета.`,
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} ${pickProp(obj1, 'color')}, а ${obj2} ${pickProp(obj2, 'color')}. Они разного цвета.`,
      `${obj1.charAt(0).toUpperCase() + obj1.slice(1)} похож на ${obj2}? ${pickProp(obj1, 'shape') === pickProp(obj2, 'shape') ? 'Да, оба одинаковой формы.' : 'Нет, они разной формы.'}`,
    ];
    lessons.push({ text: pick(templates), domain: 'comparison', complexity: 3 });
  }

  // === PHASE 6: Cause and effect (100 lessons, complexity 3) ===
  for (let i = 0; i < 100 && lessons.length < count; i++) {
    const templates = [
      'Если пойдёт дождь, мы промокнем. Нужен зонтик.',
      'Огонь горячий. Если дотронуться — будет больно. Не трогай!',
      'Лёд скользкий. Можно упасть. Осторожно!',
      'Если не поливать цветок, он завянет. Цветку нужна вода.',
      'Шарик летит потому что он лёгкий и внутри воздух.',
      'Камень тонет в воде потому что он тяжёлый.',
      'Бумага рвётся потому что она тонкая.',
      'Стекло разбивается потому что оно хрупкое.',
      `${pick(WEATHER)}. Поэтому мы ${pick(['гуляем', 'сидим дома', 'одеваемся тепло', 'берём зонтик'])}.`,
      'Если долго бежать, устанешь. Нужно отдыхать.',
      'Растения растут к солнцу. Им нужен свет.',
      'Ночью темно потому что солнце ушло за горизонт.',
      'Зимой холодно и идёт снег. Летом тепло и светит солнце.',
      'Если бросить камень в воду — будут круги. Камень тяжёлый, он тонет.',
      'Мыльный пузырь лопается потому что он очень тонкий.',
    ];
    lessons.push({ text: pick(templates), domain: 'causality', complexity: 3 });
  }

  // === PHASE 7: Emotions and social (80 lessons, complexity 3) ===
  for (let i = 0; i < 80 && lessons.length < count; i++) {
    const templates = [
      `Мне ${pick(EMOTIONS)}! А тебе?`,
      'Когда друг делится игрушкой — это добро. Спасибо!',
      'Плакать не стыдно. Все иногда грустят.',
      'Молодец! Ты правильно сделал. Я горжусь.',
      'Нет, так нельзя. Это может навредить.',
      'Помоги маме убрать игрушки. Вместе быстрее!',
      'Извини, я ошибся. Все ошибаются и это нормально.',
      `Сегодня ${pick(WEATHER)}. Настроение ${pick(EMOTIONS)}.`,
      'Улыбка — это хорошо. Когда улыбаешься, другим тоже приятно.',
      'Бояться — нормально. Храбрость — это когда делаешь несмотря на страх.',
      'Обнимашки! Обниматься приятно и тепло.',
      'Когда злишься — сделай глубокий вдох. Помогает.',
    ];
    lessons.push({ text: pick(templates), domain: 'emotions', complexity: 3 });
  }

  // === PHASE 8: Categories and rules (80 lessons, complexity 4) ===
  for (let i = 0; i < 80 && lessons.length < count; i++) {
    const templates = [
      'Мячик и яблоко — круглые. Круглые вещи катятся.',
      'Кубик и коробка — с углами. Они не катятся.',
      'Кошка и собака — домашние животные. Они живут с людьми.',
      'Птичка и бабочка — летают. У них есть крылья.',
      'Рыбка и лягушка — живут у воды.',
      'Мячик, тарелка, монетка — всё круглое. Это общее свойство.',
      'Книжка, кирпич, коробка — всё прямоугольное.',
      'Живое — дышит, ест, растёт. Неживое — нет.',
      'Фрукты — это яблоко, груша, апельсин. Они растут на деревьях.',
      'Транспорт — это машина, автобус, поезд. Они перевозят людей.',
      'Мебель — это стол, стул, кровать. Она стоит дома.',
      'Одежда — это рубашка, штаны, шапка. Мы её носим.',
    ];
    lessons.push({ text: pick(templates), domain: 'categories', complexity: 4 });
  }

  // === PHASE 9: Exceptions and corrections (50 lessons, complexity 4) ===
  for (let i = 0; i < 50 && lessons.length < count; i++) {
    const templates = [
      'Мяч для регби — не круглый, хотя это мяч. Он овальный.',
      'Не все птицы летают. Пингвин — птица, но не летает.',
      'Помидор красный и круглый, но это не фрукт — это овощ.',
      'Кит живёт в воде, но это не рыба — это млекопитающее.',
      'Подожди, я ошибся. Не все круглое катится хорошо. Апельсин катится плохо.',
      'Дельфин похож на рыбу, но дышит воздухом.',
      'Летучая мышь летает, но это не птица.',
      'Страус — самая большая птица, но она не умеет летать.',
      'Не все белое — снег. Бумага тоже белая.',
      'Огонь горячий, но не всё горячее — огонь. Солнце тоже горячее.',
    ];
    lessons.push({ text: pick(templates), domain: 'exceptions', complexity: 4 });
  }

  // === PHASE 10: Time and sequences (40 lessons, complexity 3) ===
  for (let i = 0; i < 40 && lessons.length < count; i++) {
    const templates = [
      'Сначала утро, потом день, потом вечер, потом ночь. И снова утро!',
      'Сначала посадить семечко, потом полить, потом ждать. Вырастет цветок!',
      'Вчера мы гуляли в парке. Сегодня сидим дома. Завтра пойдём в магазин.',
      'Сначала помой руки. Потом садись есть.',
      'Зима, весна, лето, осень — это времена года. Они повторяются.',
      'Понедельник, вторник, среда... Дни недели идут по порядку.',
      'Сначала яйцо, потом гусеница, потом бабочка. Это превращение!',
      'Сначала маленький, потом большой. Все растут.',
    ];
    lessons.push({ text: pick(templates), domain: 'temporal', complexity: 3 });
  }

  // Shuffle to mix domains (like real life — not all objects, then all actions)
  for (let i = lessons.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lessons[i], lessons[j]] = [lessons[j], lessons[i]];
  }

  return lessons.slice(0, count);
}
