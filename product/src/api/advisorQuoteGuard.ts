import type { AdvisorRunCreateRequest } from './backendData';

function quoteRequestKey(request: AdvisorRunCreateRequest): string {
  return JSON.stringify(request);
}

export class AdvisorQuoteConflictGuard {
  private blocked:
    | { requestKey: string; message: string }
    | null = null;

  prepare(request: AdvisorRunCreateRequest): string | null {
    const requestKey = quoteRequestKey(request);
    if (this.blocked?.requestKey === requestKey) {
      return this.blocked.message;
    }
    if (this.blocked !== null) {
      this.blocked = null;
    }
    return null;
  }

  block(request: AdvisorRunCreateRequest, message: string): void {
    this.blocked = {
      requestKey: quoteRequestKey(request),
      message,
    };
  }

  clear(): void {
    this.blocked = null;
  }
}
