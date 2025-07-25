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
import * as context from '../../../src/trace/spancontext-utils';
import { INVALID_SPANID, INVALID_TRACEID, TraceFlags } from '../../../src';

describe('spancontext-utils', function () {
  it('should return true for valid spancontext', function () {
    const spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.NONE,
    };
    assert.ok(context.isSpanContextValid(spanContext));
  });

  it('should return false when traceId is invalid', function () {
    const spanContext = {
      traceId: INVALID_TRACEID,
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.NONE,
    };
    assert.ok(!context.isSpanContextValid(spanContext));
  });

  it('should return false when traceId is malformed', function () {
    // 0x4141 is not a hex character, but doing a bitwise AND with 0xFF
    // would yield a valid character 'A'.
    const spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1\u4141',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.NONE,
    };
    assert.ok(!context.isSpanContextValid(spanContext));
  });

  it('should return false when spanId is invalid', function () {
    const spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: INVALID_SPANID,
      traceFlags: TraceFlags.NONE,
    };
    assert.ok(!context.isSpanContextValid(spanContext));
  });

  it('should return false when traceId & spanId is invalid', function () {
    const spanContext = {
      traceId: INVALID_TRACEID,
      spanId: INVALID_SPANID,
      traceFlags: TraceFlags.NONE,
    };
    assert.ok(!context.isSpanContextValid(spanContext));
  });

  it('should wrap a SpanContext in a non-recording span', function () {
    const spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.NONE,
    };

    const span = context.wrapSpanContext(spanContext);

    assert.deepStrictEqual(span.spanContext(), spanContext);
    assert.strictEqual(span.isRecording(), false);
  });
});
