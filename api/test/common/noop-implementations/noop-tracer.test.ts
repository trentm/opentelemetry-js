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
import * as sinon from 'sinon';
import {
  context,
  ROOT_CONTEXT,
  Span,
  SpanContext,
  SpanKind,
  trace,
  TraceFlags,
} from '../../../src';
import { NonRecordingSpan } from '../../../src/trace/NonRecordingSpan';
import { NoopTracer } from '../../../src/trace/NoopTracer';

describe('NoopTracer', function () {
  afterEach(() => {
    sinon.restore();
  });

  it('should not crash', function () {
    const tracer = new NoopTracer();

    assert.ok(tracer.startSpan('span-name') instanceof NonRecordingSpan);
    assert.ok(
      tracer.startSpan('span-name1', { kind: SpanKind.CLIENT }) instanceof
        NonRecordingSpan
    );
    assert.ok(
      tracer.startSpan('span-name2', { kind: SpanKind.CLIENT }) instanceof
        NonRecordingSpan
    );
  });

  it('should propagate valid spanContext on the span (from context)', function () {
    const tracer = new NoopTracer();
    const parent: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
      spanId: '6e0c63ffe4e34c42',
      traceFlags: TraceFlags.NONE,
    };
    const span = tracer.startSpan(
      'test-1',
      {},
      trace.setSpanContext(context.active(), parent)
    );
    assert.ok(span.spanContext().traceId === parent.traceId);
    assert.ok(span.spanContext().spanId === parent.spanId);
    assert.ok(span.spanContext().traceFlags === parent.traceFlags);
  });

  it('should propagate valid spanContext on the span (from current context)', function () {
    const tracer = new NoopTracer();
    const parent: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
      spanId: '6e0c63ffe4e34c42',
      traceFlags: TraceFlags.NONE,
    };

    const ctx = trace.setSpanContext(ROOT_CONTEXT, parent);
    const activeStub = sinon.stub(context, 'active');
    activeStub.returns(ctx);
    const span = tracer.startSpan('test-1');
    assert.ok(span.spanContext().traceId === parent.traceId);
    assert.ok(span.spanContext().spanId === parent.spanId);
    assert.ok(span.spanContext().traceFlags === parent.traceFlags);
  });

  it('should accept 2 to 4 args and start an active span', function () {
    const tracer = new NoopTracer();
    const name = 'span-name';
    const fn = (span: Span) => {
      try {
        return 1;
      } finally {
        span.end();
      }
    };
    const opts = { attributes: { foo: 'bar' } };

    assert.strictEqual((tracer as any).startActiveSpan(name), undefined);

    assert.strictEqual(tracer.startActiveSpan(name, fn), 1);

    assert.strictEqual(tracer.startActiveSpan(name, opts, fn), 1);

    assert.strictEqual(
      tracer.startActiveSpan(name, opts, context.active(), fn),
      1
    );
  });
});
