export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

export type ApiResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function envelope<T>(data: T, requestId?: string): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), requestId },
  };
}

export function errorEnvelope(code: string, message: string, details?: unknown, requestId?: string): ErrorEnvelope {
  return {
    success: false,
    error: { code, message, details },
    meta: { timestamp: new Date().toISOString(), requestId },
  };
}
