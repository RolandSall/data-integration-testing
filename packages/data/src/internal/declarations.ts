import { consumeDataIntegrationTestClasses, type DataIntegrationTestClass } from '../data-integration-test.js';

export function consumeDeclaration(): DataIntegrationTestClass | undefined {
  const classes = consumeDataIntegrationTestClasses();
  if (classes.length > 1) throw new Error('Expected one data integration declaration per test file');
  return classes[0];
}
