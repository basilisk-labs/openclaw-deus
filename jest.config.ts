import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(surrealdb|isows|ws|@anthropic-ai)/)',
  ],
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.integration.spec.ts', '!main.ts', '!cli.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^surrealdb$': '<rootDir>/__mocks__/surrealdb.ts',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@database/(.*)$': '<rootDir>/database/$1',
    '^@beliefs/(.*)$': '<rootDir>/beliefs/$1',
    '^@memory/(.*)$': '<rootDir>/memory/$1',
    '^@policy/(.*)$': '<rootDir>/policy/$1',
    '^@world-model/(.*)$': '<rootDir>/world-model/$1',
    '^@introspection/(.*)$': '<rootDir>/introspection/$1',
    '^@nightly/(.*)$': '<rootDir>/nightly/$1',
    '^@bootstrap/(.*)$': '<rootDir>/bootstrap/$1',
    '^@health/(.*)$': '<rootDir>/health/$1',
  },
};

export default config;
