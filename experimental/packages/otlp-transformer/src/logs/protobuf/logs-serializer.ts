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
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { ProtobufWriter } from '../../common/protobuf/protobuf-writer';
import { hexToBinary } from '../../common/hex-to-binary';
import type { Resource } from '@opentelemetry/resources';
import type { InstrumentationScope } from '@opentelemetry/core';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  writeAnyValue,
  writeAttributes,
  writeHrTimeAsFixed64,
} from '../../common/protobuf/common-serializer';

/**
 * Serialize a single LogRecord directly from ReadableLogRecord
 */
function serializeLogRecord(
  writer: ProtobufWriter,
  logRecord: ReadableLogRecord
): void {
  const logStart = writer.startLengthDelimited();
  const logStartPos = writer.pos;

  // time_unix_nano (field 1, fixed64)
  writer.writeTag(1, 1); // wire type 1 (fixed64)
  writeHrTimeAsFixed64(writer, logRecord.hrTime);

  // severity_number (field 2, enum/varint) - skip if unspecified
  if (
    logRecord.severityNumber !== undefined &&
    logRecord.severityNumber !== SeverityNumber.UNSPECIFIED
  ) {
    writer.writeTag(2, 0);
    writer.writeVarint(logRecord.severityNumber);
  }

  // severity_text (field 3, string) - skip if empty
  if (logRecord.severityText) {
    writer.writeTag(3, 2);
    writer.writeString(logRecord.severityText);
  }

  // body (field 5, AnyValue) - skip if undefined
  if (logRecord.body !== undefined) {
    writer.writeTag(5, 2);
    const bodyStart = writer.startLengthDelimited();
    const bodyStartPos = writer.pos;
    writeAnyValue(writer, logRecord.body);
    writer.finishLengthDelimited(bodyStart, writer.pos - bodyStartPos);
  }

  // attributes (field 6, repeated KeyValue)
  if (logRecord.attributes) {
    writeAttributes(writer, logRecord.attributes, 6);
  }

  // dropped_attributes_count (field 7, uint32)
  writer.writeTag(7, 0);
  writer.writeVarint(logRecord.droppedAttributesCount);

  // flags (field 8, fixed32) - skip if 0 or undefined
  if (logRecord.spanContext?.traceFlags) {
    writer.writeTag(8, 5); // wire type 5 (fixed32)
    writer.writeFixed32(logRecord.spanContext.traceFlags);
  }

  // trace_id (field 9, bytes) - skip if empty
  if (logRecord.spanContext?.traceId) {
    writer.writeTag(9, 2);
    writer.writeBytes(hexToBinary(logRecord.spanContext.traceId));
  }

  // span_id (field 10, bytes) - skip if empty
  if (logRecord.spanContext?.spanId) {
    writer.writeTag(10, 2);
    writer.writeBytes(hexToBinary(logRecord.spanContext.spanId));
  }

  // observed_time_unix_nano (field 11, fixed64)
  writer.writeTag(11, 1); // wire type 1 (fixed64)
  writeHrTimeAsFixed64(writer, logRecord.hrTimeObserved);

  // event_name (field 12, string) - skip if empty
  if (logRecord.eventName) {
    writer.writeTag(12, 2);
    writer.writeString(logRecord.eventName);
  }

  writer.finishLengthDelimited(logStart, writer.pos - logStartPos);
}

/**
 * Serialize ScopeLogs directly from SDK types
 */
function serializeScopeLogs(
  writer: ProtobufWriter,
  scope: InstrumentationScope,
  logRecords: ReadableLogRecord[]
): void {
  const scopeLogsStart = writer.startLengthDelimited();
  const scopeLogsStartPos = writer.pos;

  // scope (field 1, InstrumentationScope)
  writer.writeTag(1, 2);
  const scopeStart = writer.startLengthDelimited();
  const scopeStartPos = writer.pos;

  // Write InstrumentationScope fields directly
  writer.writeTag(1, 2);
  writer.writeString(scope.name);

  if (scope.version) {
    writer.writeTag(2, 2);
    writer.writeString(scope.version);
  }

  writer.finishLengthDelimited(scopeStart, writer.pos - scopeStartPos);

  // log_records (field 2, repeated LogRecord)
  for (const logRecord of logRecords) {
    writer.writeTag(2, 2);
    serializeLogRecord(writer, logRecord);
  }

  // schema_url (field 3, string) - skip if empty
  if (scope.schemaUrl) {
    writer.writeTag(3, 2);
    writer.writeString(scope.schemaUrl);
  }

  writer.finishLengthDelimited(scopeLogsStart, writer.pos - scopeLogsStartPos);
}

function serializeResource(
  writer: ProtobufWriter,
  resource: Resource,
  fieldNumber: number
) {
  writer.writeTag(fieldNumber, 2);
  const resourceStart = writer.startLengthDelimited();
  const resourceStartPos = writer.pos;

  // Write Resource attributes directly
  if (resource.attributes) {
    writeAttributes(writer, resource.attributes, 1);
  }

  // dropped_attributes_count (field 2, uint32) - set to 0 as we don't track this
  writer.writeTag(2, 0);
  writer.writeVarint(0);

  writer.finishLengthDelimited(resourceStart, writer.pos - resourceStartPos);
}

/**
 * Serialize ResourceLogs directly from SDK Resource type
 */
function serializeResourceLogs(
  writer: ProtobufWriter,
  resource: Resource,
  scopeMap: Map<string, ReadableLogRecord[]>
): void {
  const resourceLogsStart = writer.startLengthDelimited();
  const resourceLogsStartPos = writer.pos;

  // resource (field 1, Resource)
  serializeResource(writer, resource, 1);

  // scope_logs (field 2, repeated ScopeLogs)
  for (const scopeLogs of scopeMap.values()) {
    if (scopeLogs.length > 0) {
      writer.writeTag(2, 2);
      const scope = scopeLogs[0].instrumentationScope;
      serializeScopeLogs(writer, scope, scopeLogs);
    }
  }

  // schema_url (field 3, string) - skip if empty
  if (resource.schemaUrl) {
    writer.writeTag(3, 2);
    writer.writeString(resource.schemaUrl);
  }

  writer.finishLengthDelimited(
    resourceLogsStart,
    writer.pos - resourceLogsStartPos
  );
}

/**
 * Group log records by resource and instrumentation scope
 */
function createResourceMap(
  logRecords: ReadableLogRecord[]
): Map<Resource, Map<string, ReadableLogRecord[]>> {
  const resourceMap: Map<
    Resource,
    Map<string, ReadableLogRecord[]>
  > = new Map();

  for (const record of logRecords) {
    const resource = record.resource;
    const scope = record.instrumentationScope;

    let ismMap = resourceMap.get(resource);
    if (!ismMap) {
      ismMap = new Map();
      resourceMap.set(resource, ismMap);
    }

    const ismKey = `${scope.name}@${scope.version}:${scope.schemaUrl}`;
    let records = ismMap.get(ismKey);
    if (!records) {
      records = [];
      ismMap.set(ismKey, records);
    }
    records.push(record);
  }
  return resourceMap;
}

// Used for HACK_REUSE_WRITER below.
const gWriter = new ProtobufWriter();

// These are used for HACK_REUSE_SERIALIZED_VAL below.
// TODO(trentm): remove this
const smallLogsServiceRequestBase64 =
  'Cq8GCqwGChoKCWhvc3QubmFtZRINCgtwZWFjaC5sb2NhbAoUCglob3N0LmFyY2gSBwoFYXJtNjQKMQoHaG9zdC5pZBImCiQ4RkVCQkMzMy1ENkRBLTU3RkMtOEVGMC0xQTlDMTRCOTE5RjgKEwoLcHJvY2Vzcy5waWQSBBiWxgQKIQoXcHJvY2Vzcy5leGVjdXRhYmxlLm5hbWUSBgoEbm9kZQpPChdwcm9jZXNzLmV4ZWN1dGFibGUucGF0aBI0CjIvVXNlcnMvdHJlbnRtLy5udm0vdmVyc2lvbnMvbm9kZS92MjAuMTkuMS9iaW4vbm9kZQrFAQoUcHJvY2Vzcy5jb21tYW5kX2FyZ3MSrAEqqQEKNAoyL1VzZXJzL3RyZW50bS8ubnZtL3ZlcnNpb25zL25vZGUvdjIwLjE5LjEvYmluL25vZGUKCgoILS1pbXBvcnQKJgokLi90ZWxlbWV0cnktb2otY3VzdG9tLXNlcmlhbGl6ZXIubWpzCj0KOy9Vc2Vycy90cmVudG0vZWwvYXBtLW5vZGVqcy1kZXYvZWRvdC1iZW5jaC9hcHAtaHR0cC1waW5vLmpzCiQKF3Byb2Nlc3MucnVudGltZS52ZXJzaW9uEgkKBzIwLjE5LjEKIAoUcHJvY2Vzcy5ydW50aW1lLm5hbWUSCAoGbm9kZWpzCigKG3Byb2Nlc3MucnVudGltZS5kZXNjcmlwdGlvbhIJCgdOb2RlLmpzClAKD3Byb2Nlc3MuY29tbWFuZBI9CjsvVXNlcnMvdHJlbnRtL2VsL2FwbS1ub2RlanMtZGV2L2Vkb3QtYmVuY2gvYXBwLWh0dHAtcGluby5qcwoZCg1wcm9jZXNzLm93bmVyEggKBnRyZW50bQomCgxzZXJ2aWNlLm5hbWUSFgoUdW5rbm93bl9zZXJ2aWNlOm5vZGUKIgoWdGVsZW1ldHJ5LnNkay5sYW5ndWFnZRIICgZub2RlanMKJQoSdGVsZW1ldHJ5LnNkay5uYW1lEg8KDW9wZW50ZWxlbWV0cnkKIAoVdGVsZW1ldHJ5LnNkay52ZXJzaW9uEgcKBTIuMi4wEAA=';
const smallLogsServiceRequest = new Uint8Array(
  Buffer.from(smallLogsServiceRequestBase64, 'base64')
);

/**
 * Serialize ExportLogsServiceRequest directly from ReadableLogRecord[]
 */
export function serializeLogsExportRequest(
  logRecords: ReadableLogRecord[]
): Uint8Array {
  // Hack doing no (minimal) work, and return a smallish
  // ExportLogsServiceRequest with no log records.
  const HACK_REUSE_SERIALIZED_VAL = false;
  if (HACK_REUSE_SERIALIZED_VAL) {
    return smallLogsServiceRequest;
  }

  const resourceMap = createResourceMap(logRecords);

  // Hack to re-use the writer instance (and hence the buffer used for
  // serializing), as a possible perf improvement.
  // TODO(trentm): remove or keep this?
  const HACK_REUSE_WRITER = false;
  let writer;
  if (HACK_REUSE_WRITER) {
    writer = gWriter;
    writer.reset();
  } else {
    writer = new ProtobufWriter();
  }

  // resource_logs (field 1, repeated ResourceLogs)
  for (const [resource, scopeMap] of resourceMap) {
    writer.writeTag(1, 2);
    serializeResourceLogs(writer, resource, scopeMap);
  }

  return writer.finish();
}
