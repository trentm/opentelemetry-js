/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { startNodeSDK } from '@opentelemetry/sdk-node';

// `startNodeSDK()` reads OTEL_CONFIG_FILE (set in package.json's start script)
// and wires up trace, metric, and log pipelines from the YAML. No programmatic
// provider construction needed.
const sdk = startNodeSDK();

process.once('beforeExit', async () => {
  try {
    await sdk.shutdown();
  } catch (err) {
    console.warn('warn: error in OTel SDK shutdown:', err);
  }
})
