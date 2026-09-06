import { createDefaultContainerRegistry } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';

// These APIs are available in the published 0.1.0-beta.0 release.
const lifecycle = createVitestContainerGlobalSetup({
  root: new URL('..', import.meta.url).pathname,
  registry: createDefaultContainerRegistry(),
});
export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;
