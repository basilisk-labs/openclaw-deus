import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, ExtractionError } from '../../common/types/result.types';
import { ExtractionCandidate } from '../../common/types/belief.types';
import Anthropic from '@anthropic-ai/sdk';

const EXTRACTION_PROMPT = `Analyze the following text and extract belief candidates. A belief is a statement about user preferences, requirements, constraints, or observations that should be remembered.

For each belief found, return a JSON array of objects with:
- content: the belief statement (concise, one sentence)
- confidence: 0.0-1.0 (how confident you are this is a real belief)
- category: "communication" | "workflow" | "technical" | "preference" | "constraint"
- autoPromote: true if this is a strong, explicit statement

Text to analyze:
---
{TEXT}
---

Return ONLY a valid JSON array. If no beliefs found, return [].`;

@Injectable()
export class LlmExtractionService {
  private readonly logger = new Logger(LlmExtractionService.name);
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.LLM_API_KEY;
    if (apiKey && process.env.LLM_ENABLED === 'true') {
      this.client = new Anthropic({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async extractCandidates(content: string, source: string): Promise<Result<ExtractionCandidate[], DomainError>> {
    if (!this.client) {
      return err(new ExtractionError('LLM extraction not available — LLM_ENABLED=false or LLM_API_KEY not set'));
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: EXTRACTION_PROMPT.replace('{TEXT}', content.slice(0, 4000)),
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const candidates = this.parseResponse(text, source);
      this.logger.log(`LLM extracted ${candidates.length} candidates from ${source}`);
      return ok(candidates);
    } catch (error) {
      this.logger.error(`LLM extraction failed: ${error}`);
      return err(new ExtractionError(`LLM extraction failed: ${error}`));
    }
  }

  private parseResponse(text: string, source: string): ExtractionCandidate[] {
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const raw = JSON.parse(jsonMatch[0]) as Array<{
        content: string;
        confidence: number;
        category: string;
        autoPromote?: boolean;
      }>;

      return raw
        .filter((item) => item.content && item.confidence > 0)
        .map((item) => ({
          content: item.content,
          confidence: Math.min(1, Math.max(0, item.confidence)),
          category: item.category || 'operational',
          prefix: item.category === 'communication' ? 'M' : 'W',
          type: 'llm_extraction',
          autoPromote: item.autoPromote ?? (item.confidence > 0.8),
          provenance: `llm_${source}`,
        }));
    } catch {
      this.logger.warn('Failed to parse LLM extraction response');
      return [];
    }
  }
}
