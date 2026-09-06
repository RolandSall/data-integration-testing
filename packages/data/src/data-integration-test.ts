/** Constructor shape accepted by the data integration-test marker. */
export type DataIntegrationTestClass = abstract new (...arguments_: never[]) => unknown;

const dataIntegrationTests = new WeakSet<DataIntegrationTestClass>();
const pendingDataIntegrationTests = new Set<DataIntegrationTestClass>();

/** Marks a class as a data integration-test suite. */
export const DataIntegrationTest = <TClass extends DataIntegrationTestClass>(
  target: TClass,
): TClass => {
  dataIntegrationTests.add(target);
  pendingDataIntegrationTests.add(target);
  return target;
};

/** Reports whether a class was decorated with `@DataIntegrationTest`. */
export const isDataIntegrationTest = (target: DataIntegrationTestClass): boolean =>
  dataIntegrationTests.has(target);

/**
 * Returns and clears data integration-test classes decorated during the current test-module
 * evaluation. Runner adapters consume this queue after the module has finished loading.
 *
 * @internal
 */
export const consumeDataIntegrationTestClasses = (): readonly DataIntegrationTestClass[] => {
  const testClasses = [...pendingDataIntegrationTests];
  pendingDataIntegrationTests.clear();
  return testClasses;
};
