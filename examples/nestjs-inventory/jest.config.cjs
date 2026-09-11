module.exports = {
  testMatch: [process.env.FAILURE_MODE ? '**/test/failure.test.ts' : process.env.BASELINE ? '**/test/baseline.test.ts' : '**/test/*.integration.test.ts'],
  testEnvironment: process.env.BASELINE ? 'node' : '@integration-testing/data-isolation/jest/environment',
  setupFilesAfterEnv: process.env.BASELINE ? [] : ['<rootDir>/test/jest.setup.ts'],
  maxWorkers: process.env.DATA_CLIENT === 'sqlite' ? 1 : 2,
  testTimeout: 30000,
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { target: 'ES2023', module: 'CommonJS', experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, isolatedModules: true }, diagnostics: false }] },
};
