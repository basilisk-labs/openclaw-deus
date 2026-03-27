import { MemoryAggregationService } from './memory-aggregation.service';
import { ActivityLogEntry } from '../../common/types/memory.types';

describe('MemoryAggregationService', () => {
  let service: MemoryAggregationService;

  beforeEach(() => {
    // Create instance directly to test pure classification logic
    service = Object.create(MemoryAggregationService.prototype);
  });

  describe('classifyLogEntry', () => {
    it('should classify git entries', () => {
      const entry: ActivityLogEntry = { type: 'git', description: 'Committed changes', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('Git Activity');
    });

    it('should classify command entries', () => {
      const entry: ActivityLogEntry = { type: 'command', description: 'npm install', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('Commands Executed');
    });

    it('should classify decision entries', () => {
      const entry: ActivityLogEntry = { type: 'decision', description: 'Use TypeScript', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('Decisions');
    });

    it('should classify interaction entries', () => {
      const entry: ActivityLogEntry = { type: 'interaction', description: 'User asked about beliefs', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('Interactions');
    });

    it('should classify event entries as System Events', () => {
      const entry: ActivityLogEntry = { type: 'event', description: 'System started', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('System Events');
    });

    it('should detect git from keywords even if type is generic', () => {
      const entry: ActivityLogEntry = { type: 'event', description: 'commit pushed to main', context: {}, agent: 'DEUS', day_key: '2026-03-25', timestamp: '' };
      expect(service.classifyLogEntry(entry).section).toBe('Git Activity');
    });
  });
});
