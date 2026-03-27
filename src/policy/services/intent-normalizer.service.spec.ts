import { IntentNormalizerService } from './intent-normalizer.service';

describe('IntentNormalizerService', () => {
  let service: IntentNormalizerService;

  beforeEach(() => {
    service = new IntentNormalizerService();
  });

  describe('normalizeActionType', () => {
    it('should resolve known aliases', () => {
      expect(service.normalizeActionType('git')).toBe('git_commit');
      expect(service.normalizeActionType('commit')).toBe('git_commit');
      expect(service.normalizeActionType('delete')).toBe('destructive');
      expect(service.normalizeActionType('remove')).toBe('destructive');
      expect(service.normalizeActionType('email')).toBe('external_message');
      expect(service.normalizeActionType('message')).toBe('external_message');
      expect(service.normalizeActionType('deploy')).toBe('deploy');
      expect(service.normalizeActionType('release')).toBe('deploy');
      expect(service.normalizeActionType('read')).toBe('read');
      expect(service.normalizeActionType('write')).toBe('write_internal');
      expect(service.normalizeActionType('repo')).toBe('repo_mutation');
      expect(service.normalizeActionType('belief')).toBe('belief_mutation');
      expect(service.normalizeActionType('analyze')).toBe('analyze');
      expect(service.normalizeActionType('analysis')).toBe('analyze');
    });

    it('should return unknown for unrecognized types', () => {
      expect(service.normalizeActionType('foobar')).toBe('unknown');
      expect(service.normalizeActionType('')).toBe('unknown');
      expect(service.normalizeActionType(undefined)).toBe('unknown');
    });

    it('should be case insensitive', () => {
      expect(service.normalizeActionType('GIT')).toBe('git_commit');
      expect(service.normalizeActionType('Deploy')).toBe('deploy');
    });
  });

  describe('normalizeUrgency', () => {
    it('should accept valid values', () => {
      expect(service.normalizeUrgency('low')).toBe('low');
      expect(service.normalizeUrgency('high')).toBe('high');
      expect(service.normalizeUrgency('critical')).toBe('critical');
    });

    it('should default to medium', () => {
      expect(service.normalizeUrgency(undefined)).toBe('medium');
      expect(service.normalizeUrgency('invalid')).toBe('medium');
    });
  });

  describe('normalize', () => {
    it('should derive high_impact from flags', () => {
      const result = service.normalize({ action_type: 'deploy', goal: 'ship it' });
      expect(result.high_impact).toBe(true);
      expect(result.external).toBe(true);
    });

    it('should set requires_human_confirmation for destructive actions', () => {
      const result = service.normalize({ action_type: 'delete', goal: 'cleanup' });
      expect(result.requires_human_confirmation).toBe(true);
      expect(result.destructive).toBe(true);
    });

    it('should not require confirmation for read-only actions', () => {
      const result = service.normalize({ action_type: 'read', goal: 'check status' });
      expect(result.requires_human_confirmation).toBe(false);
      expect(result.high_impact).toBe(false);
    });
  });

  describe('classifyTarget', () => {
    it('should classify identity files', () => {
      expect(service.classifyTarget('AGENTS.md')).toBe('identity_root');
      expect(service.classifyTarget('SOUL.md')).toBe('identity_root');
      expect(service.classifyTarget('DEUS.md')).toBe('identity_root');
    });

    it('should classify belief paths', () => {
      expect(service.classifyTarget('beliefs/core.jsonl')).toBe('durable_belief_state');
    });

    it('should classify runtime paths', () => {
      expect(service.classifyTarget('memory/2026-03-25.md')).toBe('runtime_state');
      expect(service.classifyTarget('logs/2026-03-25.jsonl')).toBe('runtime_state');
    });

    it('should classify external targets', () => {
      expect(service.classifyTarget('https://api.example.com')).toBe('third_party');
    });

    it('should return unknown for null', () => {
      expect(service.classifyTarget(null)).toBe('unknown');
    });
  });
});
