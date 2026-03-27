import { Injectable } from '@nestjs/common';
import { EventFingerprint, RawSensoryEvent } from './modality.types';

/**
 * Statistical Fingerprinter: computes feature vector from raw event.
 * No semantics — pure statistical texture of the data.
 *
 * These features let the system discover WHAT KIND of data it is
 * without being told. Code has high symbol_density. Natural language
 * has high unique_token_ratio. Errors have specific patterns.
 * The system learns these distinctions itself.
 */

const SYMBOLS = new Set(['{', '}', '(', ')', '[', ']', ';', ':', '.', ',', '=', '>', '<', '/', '\\', '|', '&', '!', '@', '#', '$', '%', '^', '*', '+', '-', '_', '~']);

@Injectable()
export class FingerprinterService {
  private recentTimestamps: number[] = [];

  fingerprint(event: RawSensoryEvent): EventFingerprint {
    const content = event.content;
    const len = Math.max(1, content.length);

    // Tokens
    const tokens = content.split(/\s+/).filter(t => t.length > 0);
    const tokenCount = Math.max(1, tokens.length);
    const avgTokenLength = tokens.reduce((s, t) => s + t.length, 0) / tokenCount;
    const uniqueTokens = new Set(tokens.map(t => t.toLowerCase()));
    const uniqueTokenRatio = uniqueTokens.size / tokenCount;

    // Symbol density
    let symbolCount = 0;
    let numericCount = 0;
    let uppercaseCount = 0;
    const charCounts = new Map<string, number>();

    for (const ch of content) {
      if (SYMBOLS.has(ch)) symbolCount++;
      if (ch >= '0' && ch <= '9') numericCount++;
      if (ch >= 'A' && ch <= 'Z') uppercaseCount++;
      charCounts.set(ch, (charCounts.get(ch) || 0) + 1);
    }

    // Line structure
    const lines = content.split('\n');
    const lineCount = lines.length;
    const avgLineLength = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lineCount);

    // Character entropy (Shannon)
    let entropy = 0;
    for (const count of charCounts.values()) {
      const p = count / len;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    // Compression ratio proxy: unique chars / total chars
    const compressionRatio = charCounts.size / Math.max(1, len);

    // Temporal
    const now = event.timestamp;
    const timeSinceLast = this.recentTimestamps.length > 0
      ? now - this.recentTimestamps[this.recentTimestamps.length - 1]
      : 0;

    this.recentTimestamps.push(now);
    if (this.recentTimestamps.length > 50) this.recentTimestamps.shift();

    // Burst rate: events in last 5 seconds
    const fiveSecsAgo = now - 5000;
    const burstRate = this.recentTimestamps.filter(t => t > fiveSecsAgo).length;

    return {
      avg_token_length: round(avgTokenLength),
      unique_token_ratio: round(uniqueTokenRatio),
      symbol_density: round(symbolCount / len),
      numeric_ratio: round(numericCount / len),
      uppercase_ratio: round(uppercaseCount / len),
      line_count: lineCount,
      avg_line_length: round(avgLineLength),
      char_entropy: round(entropy),
      compression_ratio: round(compressionRatio),
      time_since_last: timeSinceLast,
      burst_rate: burstRate,
      self_similarity: 0, // computed by ModalityDiscovery
    };
  }

  /** Convert fingerprint to flat number array for clustering/projection. */
  toVector(fp: EventFingerprint): number[] {
    return [
      fp.avg_token_length / 10,     // normalize to ~[0,1]
      fp.unique_token_ratio,
      fp.symbol_density,
      fp.numeric_ratio,
      fp.uppercase_ratio,
      Math.min(1, fp.line_count / 50),
      fp.avg_line_length / 100,
      fp.char_entropy / 8,          // max entropy ~8 bits
      fp.compression_ratio,
      Math.min(1, fp.time_since_last / 10000),
      Math.min(1, fp.burst_rate / 20),
    ];
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
