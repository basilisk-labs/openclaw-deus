import { NightlyScheduler } from './nightly.scheduler';
import { ok } from 'neverthrow';

describe('NightlyScheduler', () => {
  const originalNightlyEnabled = process.env.NIGHTLY_ENABLED;

  afterEach(() => {
    if (originalNightlyEnabled === undefined) {
      delete process.env.NIGHTLY_ENABLED;
    } else {
      process.env.NIGHTLY_ENABLED = originalNightlyEnabled;
    }
  });

  it('skips scheduled nightly when NIGHTLY_ENABLED=false', async () => {
    process.env.NIGHTLY_ENABLED = 'false';
    const nightly = {
      run: jest.fn().mockResolvedValue(ok({ stages: [] })),
    };
    const scheduler = new NightlyScheduler(nightly as any);

    await scheduler.handleNightly();

    expect(nightly.run).not.toHaveBeenCalled();
  });

  it('runs nightly when NIGHTLY_ENABLED is not false', async () => {
    delete process.env.NIGHTLY_ENABLED;
    const nightly = {
      run: jest.fn().mockResolvedValue(ok({ stages: [{ name: 'x' }] })),
    };
    const scheduler = new NightlyScheduler(nightly as any);

    await scheduler.handleNightly();

    expect(nightly.run).toHaveBeenCalledTimes(1);
  });
});
