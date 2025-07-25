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

import { ExportResult, getNumberFromEnv } from '@opentelemetry/core';
import { diag } from '@opentelemetry/api';
import {
  ExportResultCode,
  globalErrorHandler,
  unrefTimer,
  BindOnceFuture,
  internal,
  callWithTimeout,
} from '@opentelemetry/core';

import type { BufferConfig } from '../types';
import type { SdkLogRecord } from './SdkLogRecord';
import type { LogRecordExporter } from './LogRecordExporter';
import type { LogRecordProcessor } from '../LogRecordProcessor';

export abstract class BatchLogRecordProcessorBase<T extends BufferConfig>
  implements LogRecordProcessor
{
  private readonly _maxExportBatchSize: number;
  private readonly _maxQueueSize: number;
  private readonly _scheduledDelayMillis: number;
  private readonly _exportTimeoutMillis: number;

  private _finishedLogRecords: SdkLogRecord[] = [];
  private _timer: NodeJS.Timeout | undefined;
  private _shutdownOnce: BindOnceFuture<void>;

  constructor(
    private readonly _exporter: LogRecordExporter,
    config?: T
  ) {
    this._maxExportBatchSize =
      config?.maxExportBatchSize ??
      getNumberFromEnv('OTEL_BLRP_MAX_EXPORT_BATCH_SIZE') ??
      512;
    this._maxQueueSize =
      config?.maxQueueSize ??
      getNumberFromEnv('OTEL_BLRP_MAX_QUEUE_SIZE') ??
      2048;
    this._scheduledDelayMillis =
      config?.scheduledDelayMillis ??
      getNumberFromEnv('OTEL_BLRP_SCHEDULE_DELAY') ??
      5000;
    this._exportTimeoutMillis =
      config?.exportTimeoutMillis ??
      getNumberFromEnv('OTEL_BLRP_EXPORT_TIMEOUT') ??
      30000;

    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);

    if (this._maxExportBatchSize > this._maxQueueSize) {
      diag.warn(
        'BatchLogRecordProcessor: maxExportBatchSize must be smaller or equal to maxQueueSize, setting maxExportBatchSize to match maxQueueSize'
      );
      this._maxExportBatchSize = this._maxQueueSize;
    }
  }

  public onEmit(logRecord: SdkLogRecord): void {
    if (this._shutdownOnce.isCalled) {
      return;
    }
    this._addToBuffer(logRecord);
  }

  public forceFlush(): Promise<void> {
    if (this._shutdownOnce.isCalled) {
      return this._shutdownOnce.promise;
    }
    return this._flushAll();
  }

  public shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  private async _shutdown(): Promise<void> {
    this.onShutdown();
    await this._flushAll();
    await this._exporter.shutdown();
  }

  /** Add a LogRecord in the buffer. */
  private _addToBuffer(logRecord: SdkLogRecord) {
    if (this._finishedLogRecords.length >= this._maxQueueSize) {
      return;
    }
    this._finishedLogRecords.push(logRecord);
    this._maybeStartTimer();
  }

  /**
   * Send all LogRecords to the exporter respecting the batch size limit
   * This function is used only on forceFlush or shutdown,
   * for all other cases _flush should be used
   * */
  private _flushAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      const promises = [];
      const batchCount = Math.ceil(
        this._finishedLogRecords.length / this._maxExportBatchSize
      );
      for (let i = 0; i < batchCount; i++) {
        promises.push(this._flushOneBatch());
      }
      Promise.all(promises)
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  }

  private _flushOneBatch(): Promise<void> {
    this._clearTimer();
    if (this._finishedLogRecords.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      callWithTimeout(
        this._export(
          this._finishedLogRecords.splice(0, this._maxExportBatchSize)
        ),
        this._exportTimeoutMillis
      )
        .then(() => resolve())
        .catch(reject);
    });
  }

  private _maybeStartTimer() {
    if (this._timer !== undefined) {
      return;
    }
    this._timer = setTimeout(() => {
      this._flushOneBatch()
        .then(() => {
          if (this._finishedLogRecords.length > 0) {
            this._clearTimer();
            this._maybeStartTimer();
          }
        })
        .catch(e => {
          globalErrorHandler(e);
        });
    }, this._scheduledDelayMillis);
    unrefTimer(this._timer);
  }

  private _clearTimer() {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _export(logRecords: SdkLogRecord[]): Promise<void> {
    const doExport = () =>
      internal
        ._export(this._exporter, logRecords)
        .then((result: ExportResult) => {
          if (result.code !== ExportResultCode.SUCCESS) {
            globalErrorHandler(
              result.error ??
                new Error(
                  `BatchLogRecordProcessor: log record export failed (status ${result})`
                )
            );
          }
        })
        .catch(globalErrorHandler);

    const pendingResources = logRecords
      .map(logRecord => logRecord.resource)
      .filter(resource => resource.asyncAttributesPending);

    // Avoid scheduling a promise to make the behavior more predictable and easier to test
    if (pendingResources.length === 0) {
      return doExport();
    } else {
      return Promise.all(
        pendingResources.map(resource => resource.waitForAsyncAttributes?.())
      ).then(doExport, globalErrorHandler);
    }
  }

  protected abstract onShutdown(): void;
}
