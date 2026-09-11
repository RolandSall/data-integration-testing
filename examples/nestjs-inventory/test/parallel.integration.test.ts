import { declareDataIntegrationTest } from '@integration-testing/data-isolation';
import { currentClient, clientKind } from './context.js';
import { inventoryScenarios } from './scenarios.js';
declareDataIntegrationTest();
inventoryScenarios(currentClient, clientKind);
