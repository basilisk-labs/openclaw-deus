import type { Config } from 'jest';
import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  testRegex: '.*\\.integration\\.spec\\.ts$',
  testTimeout: 30000,
};

export default config;
