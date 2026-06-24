export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
    // Transform ESM-only .js files from jose (and similar packages) so the CJS
    // jest runner can consume them. ts-jest handles plain .js with useESM:true.
    'node_modules/jose/.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  // Allow jest to process ESM-only packages (e.g. jose v6) rather than leaving
  // them as untransformed native ESM which CJS jest cannot load.
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/operations/**/*.ts', // Exclude operation modules from coverage
    '!src/transports/**/*.ts', // Exclude transport wiring (integration-level)
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: ['**/*.test.ts'],
  verbose: true,
};
