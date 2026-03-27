export interface BootstrapCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface BootstrapReport {
  timestamp: string;
  checks: BootstrapCheck[];
  allPassed: boolean;
  seeded: boolean;
}
