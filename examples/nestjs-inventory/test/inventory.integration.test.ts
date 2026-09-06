import { DataIntegrationTest } from '@integration-testing/data';
import { currentClient, clientKind } from './context.js';
import { inventoryScenarios } from './scenarios.js';
@DataIntegrationTest
export class InventoryIntegrationTest {}
inventoryScenarios(currentClient, clientKind);
