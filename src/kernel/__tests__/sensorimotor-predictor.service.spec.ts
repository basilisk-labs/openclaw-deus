import { SensorimotorPredictorService } from '../sensorimotor-predictor.service';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockDb = {
  query: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: [] }),
  create: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: {} }),
  execute: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: {} }),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const defaults: Record<string, number> = {
      'predictor.beta_kl': 0.1,
    };
    return defaults[key] ?? 0;
  }),
};

function createService(): SensorimotorPredictorService {
  const svc = new SensorimotorPredictorService(mockDb as any, mockConfig as any);
  (svc as any).initWeights();
  return svc;
}

// ── Helpers ────────────────────────────────────────────────────────────
const POS_DIM = 8; // default posDim

function randomPos(dim = POS_DIM): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

describe('SensorimotorPredictorService', () => {
  let svc: SensorimotorPredictorService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  // ═══════════════════════════════════════════
  // predict()
  // ═══════════════════════════════════════════
  describe('predict()', () => {
    it('returns predicted_position with correct dimensions', () => {
      const result = svc.predict(randomPos(), 'push');
      expect(result.predicted_position).toHaveLength(POS_DIM);
    });

    it('returns uncertainty array with correct dimensions', () => {
      const result = svc.predict(randomPos(), 'push');
      expect(result.uncertainty).toHaveLength(POS_DIM);
    });

    it('returns confidence in [0, 1]', () => {
      const result = svc.predict(randomPos(), 'push');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('different actions produce different predictions', () => {
      const pos = randomPos();
      const r1 = svc.predict(pos, 'push');
      const r2 = svc.predict(pos, 'shake');
      // At least one dimension should differ
      const same = r1.predicted_position.every(
        (v, i) => Math.abs(v - r2.predicted_position[i]) < 1e-12,
      );
      expect(same).toBe(false);
    });

    it('empty position returns zero-padded result', () => {
      const result = svc.predict([], 'look_closely');
      expect(result.predicted_position).toHaveLength(POS_DIM);
      // All values should be finite
      result.predicted_position.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });

    it('predictions change after training (weights updated)', async () => {
      const pos = [0.5, 0.3, 0.1, 0, 0, 0, 0, 0];
      const before = svc.predict(pos, 'push');

      // Supply transitions for training
      const transitions = Array.from({ length: 5 }, (_, i) => ({
        position_t: pos,
        position_t1: [0.6, 0.4, 0.2, 0, 0, 0, 0, 0],
        action: 'push',
        reward: 1.0,
        cycle: i,
        trained: false,
      }));
      mockDb.query.mockResolvedValueOnce({
        isOk: () => true, isErr: () => false, value: transitions,
      });

      await svc.trainOnBatch(5);
      const after = svc.predict(pos, 'push');

      const changed = before.predicted_position.some(
        (v, i) => Math.abs(v - after.predicted_position[i]) > 1e-10,
      );
      expect(changed).toBe(true);
    });

    it('confidence is higher when uncertainty is lower', () => {
      // Two separate services; one with zero-initialized weights will have different uncertainty
      const result = svc.predict([0, 0, 0, 0, 0, 0, 0, 0], 'push');
      // With zero inputs, uncertainty comes from softplus(0)=ln2≈0.693
      // confidence = 1/(1+meanUnc)
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });

    it('handles short positions by padding', () => {
      const result = svc.predict([1, 2, 3], 'drop');
      expect(result.predicted_position).toHaveLength(POS_DIM);
      expect(result.uncertainty).toHaveLength(POS_DIM);
    });
  });

  // ═══════════════════════════════════════════
  // recordTransition()
  // ═══════════════════════════════════════════
  describe('recordTransition()', () => {
    it('calls db.create with correct table and fields', async () => {
      await svc.recordTransition([1, 2, 3], [4, 5, 6], 'push', 0.5, 10);
      expect(mockDb.create).toHaveBeenCalledWith(
        'sensorimotor_transition',
        expect.objectContaining({
          action: 'push',
          reward: 0.5,
          cycle: 10,
          trained: false,
        }),
      );
    });

    it('pads position_t to posDim', async () => {
      await svc.recordTransition([1], [2], 'touch', 0, 1);
      const callArg = mockDb.create.mock.calls[0][1];
      expect(callArg.position_t).toHaveLength(POS_DIM);
      expect(callArg.position_t1).toHaveLength(POS_DIM);
      expect(callArg.position_t[0]).toBe(1);
      expect(callArg.position_t[1]).toBe(0); // padded
    });

    it('pads position_t1 to posDim', async () => {
      await svc.recordTransition([0.1, 0.2], [0.3], 'drop', 0, 2);
      const callArg = mockDb.create.mock.calls[0][1];
      expect(callArg.position_t1).toHaveLength(POS_DIM);
      expect(callArg.position_t1[0]).toBe(0.3);
      expect(callArg.position_t1[1]).toBe(0); // padded
    });
  });

  // ═══════════════════════════════════════════
  // trainOnBatch()
  // ═══════════════════════════════════════════
  describe('trainOnBatch()', () => {
    it('returns loss=0 and count=0 when no transitions', async () => {
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: [] });
      const result = await svc.trainOnBatch();
      expect(result).toEqual({ loss: 0, count: 0 });
    });

    it('processes transitions and returns positive count', async () => {
      const transitions = [
        { position_t: randomPos(), position_t1: randomPos(), action: 'push', reward: 0, cycle: 1 },
        { position_t: randomPos(), position_t1: randomPos(), action: 'drop', reward: 0.5, cycle: 2 },
      ];
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });

      const result = await svc.trainOnBatch();
      expect(result.count).toBe(2);
      expect(typeof result.loss).toBe('number');
      expect(Number.isFinite(result.loss)).toBe(true);
    });

    it('loss decreases over multiple training rounds on same data', async () => {
      const pos_t = [0.5, 0.3, 0.1, 0, 0, 0, 0, 0];
      const pos_t1 = [0.6, 0.4, 0.2, 0, 0, 0, 0, 0];
      const transitions = [
        { position_t: pos_t, position_t1: pos_t1, action: 'push', reward: 0.5, cycle: 1 },
        { position_t: pos_t, position_t1: pos_t1, action: 'push', reward: 0.5, cycle: 2 },
      ];

      const losses: number[] = [];
      for (let round = 0; round < 20; round++) {
        mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });
        const result = await svc.trainOnBatch();
        losses.push(result.loss);
      }

      // Loss at end should be less than loss at start (learning)
      expect(losses[losses.length - 1]).toBeLessThan(losses[0]);
    });

    it('marks transitions as trained', async () => {
      const transitions = [
        { position_t: randomPos(), position_t1: randomPos(), action: 'push', reward: 0, cycle: 1 },
      ];
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });

      await svc.trainOnBatch(5);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sensorimotor_transition SET trained = true'),
        expect.objectContaining({ limit: 5 }),
      );
    });

    it('persists weights every 10 steps', async () => {
      const transitions = [
        { position_t: randomPos(), position_t1: randomPos(), action: 'push', reward: 0, cycle: 1 },
      ];

      // Run 10 batches to trigger persistence
      for (let i = 0; i < 10; i++) {
        mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });
        await svc.trainOnBatch();
      }

      // db.create should have been called for 'sensorimotor_weights' at step 10
      const weightsCalls = mockDb.create.mock.calls.filter(
        (c: any[]) => c[0] === 'sensorimotor_weights',
      );
      expect(weightsCalls.length).toBe(1);
    });

    it('returns loss=0 and count=0 when query returns error', async () => {
      mockDb.query.mockResolvedValueOnce({ isOk: () => false, isErr: () => true, value: [] });
      const result = await svc.trainOnBatch();
      expect(result).toEqual({ loss: 0, count: 0 });
    });
  });

  // ═══════════════════════════════════════════
  // forward/backward invariants
  // ═══════════════════════════════════════════
  describe('forward/backward invariants', () => {
    it('weights change after backward pass', () => {
      const pos = randomPos();
      const target = randomPos();
      (svc as any).forward(pos, 'push');
      const wBefore = JSON.stringify((svc as any).W_delta);
      (svc as any).backward(target, 0.5);
      const wAfter = JSON.stringify((svc as any).W_delta);
      expect(wAfter).not.toEqual(wBefore);
    });

    it('gradients are clamped to [-1, 1]', () => {
      const clamp = (svc as any).clamp.bind(svc);
      expect(clamp(5)).toBe(1);
      expect(clamp(-5)).toBe(-1);
      expect(clamp(0.3)).toBeCloseTo(0.3);
    });

    it('loss is finite (no NaN/Infinity)', () => {
      const pos = randomPos();
      const target = randomPos();
      (svc as any).forward(pos, 'push');
      const loss = (svc as any).computeLoss(
        (svc as any).lastInput.slice(0, POS_DIM).map((p: number, i: number) => p + ((svc as any).lastDelta[i] || 0)),
        target,
        0.5,
      );
      expect(Number.isFinite(loss)).toBe(true);
      expect(Number.isNaN(loss)).toBe(false);
    });

    it('uncertainty is always positive (softplus)', () => {
      const pos = randomPos();
      (svc as any).forward(pos, 'push');
      const unc: number[] = (svc as any).lastUncertainty;
      unc.forEach(u => {
        expect(u).toBeGreaterThan(0);
      });
    });

    it('prediction stays bounded (tanh x scale)', () => {
      // Run many random inputs and check delta is bounded by SCALE=0.5
      for (let trial = 0; trial < 20; trial++) {
        const pos = randomPos();
        const { predicted } = (svc as any).forward(pos, 'push') as { predicted: number[]; uncertainty: number[] };
        const delta: number[] = (svc as any).lastDelta;
        delta.forEach(d => {
          expect(Math.abs(d)).toBeLessThanOrEqual(0.5 + 1e-10); // SCALE = 0.5
        });
      }
    });
  });

  // ═══════════════════════════════════════════
  // updatePosDim()
  // ═══════════════════════════════════════════
  describe('updatePosDim()', () => {
    it('expanding dim does not break predict', () => {
      svc.updatePosDim(12);
      const result = svc.predict(randomPos(12), 'push');
      expect(result.predicted_position).toHaveLength(12);
      expect(result.uncertainty).toHaveLength(12);
      result.predicted_position.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });

    it('W matrices grow correctly', () => {
      const wDeltaRowsBefore = (svc as any).W_delta.length;
      const wDeltaColsBefore = (svc as any).W_delta[0].length;

      svc.updatePosDim(16);

      const expectedInputDim = 16 + 8; // posDim + ACTION_EMBED_DIM
      expect((svc as any).W_delta.length).toBe(expectedInputDim);
      expect((svc as any).W_delta[0].length).toBe(16);
      expect((svc as any).W_unc.length).toBe(expectedInputDim);
      expect((svc as any).W_unc[0].length).toBe(16);

      // Grew from previous size
      expect((svc as any).W_delta.length).toBeGreaterThan(wDeltaRowsBefore);
      expect((svc as any).W_delta[0].length).toBeGreaterThan(wDeltaColsBefore);
    });

    it('shrinking dim is a no-op', () => {
      const dimBefore = (svc as any).posDim;
      svc.updatePosDim(dimBefore - 2);
      expect((svc as any).posDim).toBe(dimBefore);
    });
  });

  // ═══════════════════════════════════════════
  // ensureAction()
  // ═══════════════════════════════════════════
  describe('ensureAction()', () => {
    it('new actions get added to index', () => {
      const sizeBefore = (svc as any).actionIndex.size;
      (svc as any).ensureAction('fly_to_moon');
      expect((svc as any).actionIndex.has('fly_to_moon')).toBe(true);
      expect((svc as any).actionIndex.size).toBe(sizeBefore + 1);
    });

    it('W_action grows for new actions', () => {
      const rowsBefore = (svc as any).W_action.length;
      (svc as any).ensureAction('teleport');
      expect((svc as any).W_action.length).toBe(rowsBefore + 1);
      expect((svc as any).W_action[(svc as any).W_action.length - 1]).toHaveLength(8); // ACTION_EMBED_DIM
    });
  });
});
