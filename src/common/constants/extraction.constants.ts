export interface ExtractionPattern {
  patterns: RegExp[];
  category: string;
  prefix: string;
}

export const EXTRACTION_PATTERNS: Record<string, ExtractionPattern> = {
  // Russian patterns
  communication_ru: {
    patterns: [
      /предпочитаю (.+?)(?:\.|$)/gi,
      /не нравится (.+?)(?:\.|$)/gi,
      /не используй (.+?)(?:\.|$)/gi,
      /избегай (.+?)(?:\.|$)/gi,
    ],
    category: 'communication',
    prefix: 'M',
  },
  workflow_ru: {
    patterns: [
      /хочу (.+?)(?:\.|$)/gi,
      /нужно (.+?)(?:\.|$)/gi,
      /важно (.+?)(?:\.|$)/gi,
      /критично (.+?)(?:\.|$)/gi,
    ],
    category: 'workflow',
    prefix: 'W',
  },
  constraint_ru: {
    patterns: [
      /никогда не (.+?)(?:\.|$)/gi,
      /нельзя (.+?)(?:\.|$)/gi,
      /запрещено (.+?)(?:\.|$)/gi,
      /обязательно (.+?)(?:\.|$)/gi,
    ],
    category: 'constraint',
    prefix: 'C',
  },
  // English patterns
  communication_en: {
    patterns: [
      /I prefer (.+?)(?:\.|$)/gi,
      /I don'?t like (.+?)(?:\.|$)/gi,
      /don'?t use (.+?)(?:\.|$)/gi,
      /avoid (.+?)(?:\.|$)/gi,
      /I always (.+?)(?:\.|$)/gi,
      /I never (.+?)(?:\.|$)/gi,
    ],
    category: 'communication',
    prefix: 'M',
  },
  workflow_en: {
    patterns: [
      /I want (.+?)(?:\.|$)/gi,
      /I need (.+?)(?:\.|$)/gi,
      /it'?s important (?:that |to )?(.+?)(?:\.|$)/gi,
      /it'?s critical (?:that |to )?(.+?)(?:\.|$)/gi,
      /make sure (?:that |to )?(.+?)(?:\.|$)/gi,
    ],
    category: 'workflow',
    prefix: 'W',
  },
  constraint_en: {
    patterns: [
      /never (.+?)(?:\.|$)/gi,
      /must not (.+?)(?:\.|$)/gi,
      /always (.+?)(?:\.|$)/gi,
      /required (?:that |to )?(.+?)(?:\.|$)/gi,
    ],
    category: 'constraint',
    prefix: 'C',
  },
};

export const SIGNAL_KEYWORDS = [
  // Russian
  'предпочитаю', 'не нравится', 'не используй', 'избегай',
  'хочу', 'нужно', 'важно', 'критично',
  'никогда', 'нельзя', 'запрещено', 'обязательно',
  // English
  'prefer', 'dislike', 'avoid', 'want', 'need', 'important', 'critical',
  'always', 'never', 'must', 'required', 'make sure',
];

export function hasExtractionSignal(text: string): boolean {
  const normalized = (text || '').toLowerCase();
  return SIGNAL_KEYWORDS.some((kw) => normalized.includes(kw));
}
