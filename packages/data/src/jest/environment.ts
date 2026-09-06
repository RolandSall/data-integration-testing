import { TestEnvironment } from 'jest-environment-node';
import type { Circus } from '@jest/types';
import { BRIDGE_KEY, type JestDataBridge, type JestDataGlobal } from './bridge.js';
import type { TransactionSession } from '../internal/transaction-session.js';

/** Jest Circus Node environment. Database objects stay inside the test sandbox. */
export default class DataIntegrationTestEnvironment extends TestEnvironment {
  private bridge: JestDataBridge | undefined;
  private session: TransactionSession | undefined;
  private active = false;
  private cleaned = false;

  override async setup(): Promise<void> {
    await super.setup();
    (this.global as typeof this.global & JestDataGlobal).__integration_testing_data_environment__ = true;
  }

  private wrap<T extends (...args: never[]) => unknown>(fn: T, transactional: boolean): T {
    if (fn.length > 0) throw new Error('Callback-style done tests/hooks are not supported in data integration files');
    const inSession = <U>(work: () => U): U => {
      if (!this.session) throw new Error('Data integration transaction did not start');
      return this.session.run(work);
    };
    return function(this: unknown, ...args: never[]) {
      const invoke = () => fn.apply(this, args);
      if (!transactional) return invoke();
      return inSession(invoke);
    } as T;
  }

  private prepare(block: Circus.DescribeBlock): void {
    for (const hook of block.hooks) hook.fn = this.wrap(hook.fn, hook.type === 'beforeEach' || hook.type === 'afterEach');
    for (const child of block.children) {
      if (child.type === 'describeBlock') this.prepare(child);
      else {
        if (child.concurrent) throw new Error('Concurrent tests are not supported in data integration files; use parallel files');
        if (child.mode !== 'todo') child.fn = this.wrap(child.fn, true);
      }
    }
  }

  async handleTestEvent(event: Circus.Event, state: Circus.State): Promise<void> {
    if (event.name === 'run_start') {
      this.bridge = (this.global as typeof this.global & JestDataGlobal)[BRIDGE_KEY];
      this.active = this.bridge?.activate() ?? false;
      if (this.active) {
        this.prepare(state.rootDescribeBlock);
        await this.bridge?.setup();
      }
    }
    if (!this.active) return;
    if (event.name === 'test_started') {
      try { this.session = await this.bridge?.begin(event.test.name); }
      catch (error) { event.test.errors.push(error); }
    }
    if (event.name === 'test_done') {
      // Append infrastructure errors after Circus has interpreted test.failing.
      try { await this.session?.finish(); }
      catch (error) { event.test.errors.push(error); }
      finally { this.session = undefined; }
    }
    if (event.name === 'run_finish') await this.cleanUp();
  }

  private async cleanUp(): Promise<void> {
    if (this.cleaned || !this.active) return;
    this.cleaned = true;
    const failures: unknown[] = [];
    try { await this.session?.finish(); } catch (error) { failures.push(error); }
    this.session = undefined;
    try { await this.bridge?.teardown(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'Jest data integration cleanup failed');
  }

  override async teardown(): Promise<void> {
    try { await this.cleanUp(); }
    finally {
      delete (this.global as typeof this.global & JestDataGlobal)[BRIDGE_KEY];
      await super.teardown();
    }
  }
}
