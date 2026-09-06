import { declareDataIntegrationTest } from '@integration-testing/data';
import { currentClient, clientKind } from './context.js';
import { inventoryScenarios } from './scenarios.js';
declareDataIntegrationTest();
inventoryScenarios(currentClient, clientKind);
