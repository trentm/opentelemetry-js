/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { createContextKey, ROOT_CONTEXT } from '../../../src/context/context';
import { NoopContextManager } from '../../../src/context/NoopContextManager';

describe('NoopContextManager', function () {
  let contextManager: NoopContextManager;

  describe('.enable()', function () {
    it('should work', function () {
      assert.doesNotThrow(() => {
        contextManager = new NoopContextManager();
        assert.ok(
          contextManager.enable() === contextManager,
          'should return this'
        );
      });
    });
  });

  describe('.disable()', function () {
    it('should work', function () {
      assert.doesNotThrow(() => {
        assert.ok(
          contextManager.disable() === contextManager,
          'should return this'
        );
      });
      contextManager.enable();
    });
  });

  describe('.with()', function () {
    it('should run the callback (ROOT_CONTEXT as target)', done => {
      contextManager.with(ROOT_CONTEXT, done);
    });

    it('should run the callback (object as target)', done => {
      const key = createContextKey('test key 1');
      const test = ROOT_CONTEXT.setValue(key, 1);
      contextManager.with(test, function () {
        assert.strictEqual(
          contextManager.active(),
          ROOT_CONTEXT,
          'should not have context'
        );
        return done();
      });
    });

    it('should run the callback (when disabled)', done => {
      contextManager.disable();
      contextManager.with(ROOT_CONTEXT, function () {
        contextManager.enable();
        return done();
      });
    });

    it('should forward this, arguments and return value', function () {
      function fnWithThis(this: string, a: string, b: number): string {
        assert.strictEqual(this, 'that');
        assert.strictEqual(arguments.length, 2);
        assert.strictEqual(a, 'one');
        assert.strictEqual(b, 2);
        return 'done';
      }

      const res = contextManager.with(
        ROOT_CONTEXT,
        fnWithThis,
        'that',
        'one',
        2
      );
      assert.strictEqual(res, 'done');

      assert.strictEqual(
        contextManager.with(ROOT_CONTEXT, () => 3.14),
        3.14
      );
    });
  });

  describe('.active()', function () {
    it('should always return ROOT_CONTEXT (when enabled)', function () {
      assert.strictEqual(
        contextManager.active(),
        ROOT_CONTEXT,
        'should not have context'
      );
    });

    it('should always return ROOT_CONTEXT (when disabled)', function () {
      contextManager.disable();
      assert.strictEqual(
        contextManager.active(),
        ROOT_CONTEXT,
        'should not have context'
      );
      contextManager.enable();
    });
  });

  describe('.bind()', function () {
    it('should return the same target (when enabled)', function () {
      const test = { a: 1 };
      assert.deepStrictEqual(
        contextManager.bind(contextManager.active(), test),
        test
      );
    });

    it('should return the same target (when disabled)', function () {
      contextManager.disable();
      const test = { a: 1 };
      assert.deepStrictEqual(
        contextManager.bind(contextManager.active(), test),
        test
      );
      contextManager.enable();
    });
  });
});
