import { Injectable, Logger } from "@nestjs/common";
import { DomainError, Result, err, ok } from "../common/types/result.types";
import { LLMPort, LLMRequest, LLMResponse } from "./types/llm-port.types";
import { LlmError } from "./llm.errors";

@Injectable()
export class OpenClawGatewayAdapter implements LLMPort {
  private readonly logger = new Logger(OpenClawGatewayAdapter.name);

  isAvailable(): boolean {
    return Boolean(this.baseUrl());
  }

  async complete(
    request: LLMRequest,
  ): Promise<Result<LLMResponse, DomainError>> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) {
      return err(
        new LlmError(
          "OpenClaw gateway adapter unavailable — gateway URL not configured",
        ),
      );
    }

    const startedAt = Date.now();

    try {
      const response = await fetch(`${baseUrl}${this.path()}`, {
        method: "POST",
        headers: this.headers(request.call_id),
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });

      if (!response.ok) {
        return err(
          new LlmError(`OpenClaw gateway call failed: HTTP ${response.status}`),
        );
      }

      const payload = (await response.json()) as Partial<LLMResponse>;
      return ok({
        output_text: payload.output_text || "",
        output_data: payload.output_data,
        usage: payload.usage,
        provider: payload.provider || "openclaw",
        model: payload.model,
        latency_ms: payload.latency_ms || Date.now() - startedAt,
        cached: payload.cached,
        call_id: payload.call_id || request.call_id,
      });
    } catch (error: any) {
      this.logger.warn(
        `OpenClaw gateway call failed: ${error?.message || error}`,
      );
      return err(
        new LlmError(
          `OpenClaw gateway call failed: ${error?.message || error}`,
        ),
      );
    }
  }

  private headers(callId?: string): Record<string, string> {
    const apiKey = process.env.OPENCLAW_API_KEY || process.env.OPENCLOW_API_KEY;
    return {
      "content-type": "application/json",
      ...(apiKey
        ? { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey }
        : {}),
      ...(callId ? { "x-llm-call-id": callId } : {}),
    };
  }

  private baseUrl(): string {
    return (
      process.env.OPENCLAW_GATEWAY_URL ||
      process.env.OPENCLOW_GATEWAY_URL ||
      ""
    ).replace(/\/$/, "");
  }

  private path(): string {
    return process.env.OPENCLAW_GATEWAY_PATH || "/inference/complete";
  }

  private timeoutMs(): number {
    return parseInt(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || "15000", 10);
  }
}
