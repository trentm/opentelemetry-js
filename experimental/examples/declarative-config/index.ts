/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { trace, metrics } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const tracer = trace.getTracer('example');
const meter = metrics.getMeter('example');
const logger = logs.getLogger('example');

const counter = meter.createCounter('example.requests', {
  description: 'Demo counter incremented per request',
});

async function main(): Promise<void> {
  await tracer.startActiveSpan('example.request', async span => {
    span.setAttribute('example.kind', 'demo');
    counter.add(1, { route: '/hello' });
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      body: 'Handled example request',
      attributes: { route: '/hello' },
    });
    span.end();
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
