import { DataIntegrationTest } from '@integration-testing/data-isolation';
import { currentClient, clientKind } from './context.js';
import { inventoryScenarios } from './scenarios.js';
@DataIntegrationTest
export class InventoryIntegrationTest {}
inventoryScenarios(currentClient, clientKind);
