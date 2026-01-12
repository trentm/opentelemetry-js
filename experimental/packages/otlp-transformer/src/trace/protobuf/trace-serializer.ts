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
import { Link, SpanStatus } from '@opentelemetry/api';
import type { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import type { Resource } from '@opentelemetry/resources';
import type { InstrumentationScope } from '@opentelemetry/core';
import { ProtobufWriter } from '../../common/protobuf/protobuf-writer';
import { hexToBinary } from '../../common/hex-to-binary';
import {
  writeAttributes,
  writeHrTimeAsFixed64,
} from '../../common/protobuf/common-serializer';

// Span flags constants matching the OTLP specification
const SPAN_FLAGS_CONTEXT_HAS_IS_REMOTE_MASK = 0x100;
const SPAN_FLAGS_CONTEXT_IS_REMOTE_MASK = 0x200;

function serializeSpanEvent(writer: ProtobufWriter, event: TimedEvent) {
  const ldStart = writer.startLengthDelimited();
  const ldStartPos = writer.pos;

  // fixed64 time_unix_nano = 1;
  writer.writeTag(1, 1); // wire type 1 (fixed64)
  writeHrTimeAsFixed64(writer, event.time);

  // string name = 2;
  writer.writeTag(2, 2);
  writer.writeString(event.name);

  // repeated opentelemetry.proto.common.v1.KeyValue attributes = 3;
  if (event.attributes) {
    writeAttributes(writer, event.attributes, 3);
  }

  // uint32 dropped_attributes_count = 4;
  if (event.droppedAttributesCount) {
    writer.writeTag(4, 0);
    writer.writeVarint(event.droppedAttributesCount);
  }

  writer.finishLengthDelimited(ldStart, writer.pos - ldStartPos);
}

function serializeSpanLink(writer: ProtobufWriter, link: Link) {
  const ldStart = writer.startLengthDelimited();
  const ldStartPos = writer.pos;

  const spanContext = link.context;

  // bytes trace_id = 1;
  writer.writeTag(1, 2);
  writer.writeBytes(hexToBinary(spanContext.traceId));

  // bytes span_id = 2;
  writer.writeTag(2, 2);
  writer.writeBytes(hexToBinary(spanContext.spanId));

  // string trace_state = 3;
  if (spanContext.traceState) {
    writer.writeTag(3, 2);
    writer.writeString(spanContext.traceState.serialize());
  }

  // repeated opentelemetry.proto.common.v1.KeyValue attributes = 4;
  if (link.attributes) {
    writeAttributes(writer, link.attributes, 4);
  }

  // uint32 dropped_attributes_count = 5;
  writer.writeTag(5, 0);
  writer.writeVarint(link.droppedAttributesCount || 0);

  // fixed32 flags = 6;
  let flags =
    (spanContext.traceFlags & 0xff) | SPAN_FLAGS_CONTEXT_HAS_IS_REMOTE_MASK;
  if (spanContext.isRemote) {
    flags |= SPAN_FLAGS_CONTEXT_IS_REMOTE_MASK;
  }
  writer.writeTag(6, 5); // wire type 5 (fixed32)
  writer.writeFixed32(flags);

  writer.finishLengthDelimited(ldStart, writer.pos - ldStartPos);
}

function serializeSpanStatus(writer: ProtobufWriter, status: SpanStatus) {
  const ldStart = writer.startLengthDelimited();
  const ldStartPos = writer.pos;

  // string message = 2;
  if (status.message) {
    writer.writeTag(2, 2);
    writer.writeString(status.message);
  }

  // StatusCode code = 3;
  // trace.proto and `@opentelemetry/api` `SpanStatusCode` share the same values.
  writer.writeTag(3, 0);
  writer.writeVarint(status.code);

  writer.finishLengthDelimited(ldStart, writer.pos - ldStartPos);
}

/**
 * Serialize a single proto.Span directly from ReadableSpan
 */
function serializeSpan(writer: ProtobufWriter, span: ReadableSpan): void {
  const spanStart = writer.startLengthDelimited();
  const spanStartPos = writer.pos;

  // bytes trace_id = 1;
  const spanContext = span.spanContext();
  writer.writeTag(1, 2);
  // TODO: is hexToBinary expensive? Could avoid `new Uint8Array`, reuse buf. Can SpanContext carry the binary ver?
  writer.writeBytes(hexToBinary(spanContext.traceId));

  // bytes span_id = 2;
  writer.writeTag(2, 2);
  writer.writeBytes(hexToBinary(spanContext.spanId));

  // string trace_state = 3;
  if (spanContext.traceState) {
    writer.writeTag(3, 2);
    writer.writeString(spanContext.traceState.serialize());
  }

  // bytes parent_span_id = 4;
  let flags =
    (spanContext.traceFlags & 0xff) | SPAN_FLAGS_CONTEXT_HAS_IS_REMOTE_MASK;
  if (span.parentSpanContext) {
    writer.writeTag(4, 2);
    writer.writeBytes(hexToBinary(span.parentSpanContext.spanId));
    if (span.parentSpanContext.isRemote) {
      flags |= SPAN_FLAGS_CONTEXT_IS_REMOTE_MASK;
    }
  }

  // string name = 5;
  writer.writeTag(5, 2);
  writer.writeString(span.name);

  // SpanKind kind = 6;
  // `enum SpanKind` in trace.proto happens to be +1 the `enum SpanKind`
  // values in `@opentelemetry/api`, because the proto file has
  // `SPAN_KIND_UNSPECIFIED = 0`.
  // TODO: old serializer (function sdkSpanToOtlpSpan) was guarding against span.kind == null. Do we need that same guard?
  writer.writeTag(6, 0);
  writer.writeVarint(span.kind == null ? 0 : span.kind + 1);

  // fixed64 start_time_unix_nano = 7;
  writer.writeTag(7, 1); // wire type 1 (fixed64)
  writeHrTimeAsFixed64(writer, span.startTime);

  // fixed64 end_time_unix_nano = 8;
  writer.writeTag(8, 1); // wire type 1 (fixed64)
  writeHrTimeAsFixed64(writer, span.endTime);

  // repeated opentelemetry.proto.common.v1.KeyValue attributes = 9;
  writeAttributes(writer, span.attributes, 9);

  // uint32 dropped_attributes_count = 10;
  writer.writeTag(10, 0);
  writer.writeVarint(span.droppedAttributesCount);

  // repeated Event events = 11;
  for (const event of span.events) {
    writer.writeTag(11, 2);
    serializeSpanEvent(writer, event);
  }

  // uint32 dropped_events_count = 12;
  writer.writeTag(12, 0);
  writer.writeVarint(span.droppedEventsCount);

  // repeated Link links = 13;
  for (const link of span.links) {
    writer.writeTag(13, 2);
    serializeSpanLink(writer, link);
  }

  // uint32 dropped_links_count = 14;
  writer.writeTag(14, 0);
  writer.writeVarint(span.droppedLinksCount);

  // Status status = 15;
  writer.writeTag(15, 2);
  serializeSpanStatus(writer, span.status);

  // fixed32 flags = 16;
  writer.writeTag(16, 5); // wire type 5 (fixed32)
  writer.writeFixed32(flags);

  writer.finishLengthDelimited(spanStart, writer.pos - spanStartPos);
}

/**
 * Serialize ScopeSpans directly from SDK types
 */
function serializeScopeSpans(
  writer: ProtobufWriter,
  scope: InstrumentationScope,
  spans: ReadableSpan[]
): void {
  const scopeSpansStart = writer.startLengthDelimited();
  const scopeSpansStartPos = writer.pos;

  // TODO: could pull writeInstrumentationScope out to shared
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
  // TODO: skipping possible scope.attributes and scope.dropped_attributes_count here
  writer.finishLengthDelimited(scopeStart, writer.pos - scopeStartPos);

  // repeated Span spans = 2;
  for (const span of spans) {
    writer.writeTag(2, 2);
    serializeSpan(writer, span);
  }

  // schema_url (field 3, string) - skip if empty
  if (scope.schemaUrl) {
    writer.writeTag(3, 2);
    writer.writeString(scope.schemaUrl);
  }

  writer.finishLengthDelimited(
    scopeSpansStart,
    writer.pos - scopeSpansStartPos
  );
}

// TODO: could share this fn with other signals.
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

  // TODO(trentm): for maint, having PROTOBUF_WIRE_TYPE_VARINT=0 or some const for the wireType would be nice.
  // dropped_attributes_count (field 2, uint32) - set to 0 as we don't track this
  writer.writeTag(2, 0);
  writer.writeVarint(0);

  writer.finishLengthDelimited(resourceStart, writer.pos - resourceStartPos);
}

function serializeResourceSpans(
  writer: ProtobufWriter,
  resource: Resource,
  scopeMap: Map<string, ReadableSpan[]>
): void {
  const resourceSpansStart = writer.startLengthDelimited();
  const resourceSpansStartPos = writer.pos;

  // resource (field 1, Resource)
  serializeResource(writer, resource, 1);

  // TODO(trentm, perf): s/for-of/for/ micro-optimization, maybe
  // scope_spans (field 2, repeated ScopeSpans)
  for (const scopeSpans of scopeMap.values()) {
    if (scopeSpans.length > 0) {
      writer.writeTag(2, 2);
      const scope = scopeSpans[0].instrumentationScope;
      serializeScopeSpans(writer, scope, scopeSpans);
    }
  }

  // schema_url (field 3, string) - skip if empty
  if (resource.schemaUrl) {
    writer.writeTag(3, 2);
    writer.writeString(resource.schemaUrl);
  }

  writer.finishLengthDelimited(
    resourceSpansStart,
    writer.pos - resourceSpansStartPos
  );
}

/**
 * Group spans by resource and instrumentation scope.
 */
function createResourceMap(
  spans: ReadableSpan[]
): Map<Resource, Map<string, ReadableSpan[]>> {
  const resourceMap: Map<Resource, Map<string, ReadableSpan[]>> = new Map();

  for (const span of spans) {
    const resource = span.resource;
    const scope = span.instrumentationScope;

    let scopeMap = resourceMap.get(resource);
    if (!scopeMap) {
      scopeMap = new Map();
      resourceMap.set(resource, scopeMap);
    }

    // TODO(trentm): Do same `|| ''` treatment for logs signal? E.g. if version is literal 'undefined' string?
    const scopeKey = `${scope.name}@${scope.version || ''}:${scope.schemaUrl || ''}`;
    let records = scopeMap.get(scopeKey);
    if (!records) {
      records = [];
      scopeMap.set(scopeKey, records);
    }
    records.push(span);
  }
  return resourceMap;
}

// Used for HACK_REUSE_WRITER below.
const gWriter = new ProtobufWriter();

// These are used for HACK_REUSE_SERIALIZED_VAL below.
// https://gist.github.com/trentm/15ffab9adde8c178886a1856ccbc649b
// TODO(trentm): remove this
const smallRequestBase64 =
  'CqwKCqwGChoKCWhvc3QubmFtZRINCgtwZWFjaC5sb2NhbAoUCglob3N0LmFyY2gSBwoFYXJtNjQKMQoHaG9zdC5pZBImCiQ4RkVCQkMzMy1ENkRBLTU3RkMtOEVGMC0xQTlDMTRCOTE5RjgKEwoLcHJvY2Vzcy5waWQSBBiI4wQKIQoXcHJvY2Vzcy5leGVjdXRhYmxlLm5hbWUSBgoEbm9kZQpPChdwcm9jZXNzLmV4ZWN1dGFibGUucGF0aBI0CjIvVXNlcnMvdHJlbnRtLy5udm0vdmVyc2lvbnMvbm9kZS92MjAuMTkuMS9iaW4vbm9kZQrFAQoUcHJvY2Vzcy5jb21tYW5kX2FyZ3MSrAEqqQEKNAoyL1VzZXJzL3RyZW50bS8ubnZtL3ZlcnNpb25zL25vZGUvdjIwLjE5LjEvYmluL25vZGUKCgoILS1pbXBvcnQKJgokLi90ZWxlbWV0cnktb2otY3VzdG9tLXNlcmlhbGl6ZXIubWpzCj0KOy9Vc2Vycy90cmVudG0vZWwvYXBtLW5vZGVqcy1kZXYvZWRvdC1iZW5jaC9hcHAtaHR0cC1waW5vLmpzCiQKF3Byb2Nlc3MucnVudGltZS52ZXJzaW9uEgkKBzIwLjE5LjEKIAoUcHJvY2Vzcy5ydW50aW1lLm5hbWUSCAoGbm9kZWpzCigKG3Byb2Nlc3MucnVudGltZS5kZXNjcmlwdGlvbhIJCgdOb2RlLmpzClAKD3Byb2Nlc3MuY29tbWFuZBI9CjsvVXNlcnMvdHJlbnRtL2VsL2FwbS1ub2RlanMtZGV2L2Vkb3QtYmVuY2gvYXBwLWh0dHAtcGluby5qcwoZCg1wcm9jZXNzLm93bmVyEggKBnRyZW50bQomCgxzZXJ2aWNlLm5hbWUSFgoUdW5rbm93bl9zZXJ2aWNlOm5vZGUKIgoWdGVsZW1ldHJ5LnNkay5sYW5ndWFnZRIICgZub2RlanMKJQoSdGVsZW1ldHJ5LnNkay5uYW1lEg8KDW9wZW50ZWxlbWV0cnkKIAoVdGVsZW1ldHJ5LnNkay52ZXJzaW9uEgcKBTIuMi4wEAAS+gMKLgojQG9wZW50ZWxlbWV0cnkvaW5zdHJ1bWVudGF0aW9uLWh0dHASBzAuMjA4LjASxwMKEECXvGFOUkv7B7vcEkB5chMSCIM8NWjzHr8lKgNHRVQwAjnAxqoghpCIGEGOiPoghpCIGEokCghodHRwLnVybBIYChZodHRwOi8vbG9jYWxob3N0OjMwMDAvSh0KCWh0dHAuaG9zdBIQCg5sb2NhbGhvc3Q6MzAwMEocCg1uZXQuaG9zdC5uYW1lEgsKCWxvY2FsaG9zdEoUCgtodHRwLm1ldGhvZBIFCgNHRVRKFQoLaHR0cC5zY2hlbWUSBgoEaHR0cEoSCgtodHRwLnRhcmdldBIDCgEvSh8KD2h0dHAudXNlcl9hZ2VudBIMCgpjdXJsLzguNy4xShQKC2h0dHAuZmxhdm9yEgUKAzEuMUoZCg1uZXQudHJhbnNwb3J0EggKBmlwX3RjcEoUCgtuZXQuaG9zdC5pcBIFCgM6OjFKFAoNbmV0Lmhvc3QucG9ydBIDGLgXShQKC25ldC5wZWVyLmlwEgUKAzo6MUoVCg1uZXQucGVlci5wb3J0EgQY4f0DShcKEGh0dHAuc3RhdHVzX2NvZGUSAxjIAUoYChBodHRwLnN0YXR1c190ZXh0EgQKAk9LUABgAHAAegIYAIUBAQEAAA==';
const smallRequest = new Uint8Array(Buffer.from(smallRequestBase64, 'base64'));

/**
 * Serialize ExportTraceServiceRequest directly from ReadableSpan[]
 */
export function serializeTraceExportRequest(spans: ReadableSpan[]): Uint8Array {
  // Hack doing no (minimal) serialization work, to isolate for performance comparison.
  // TODO(trentm): remove this
  const HACK_REUSE_SERIALIZED_VAL = false;
  if (HACK_REUSE_SERIALIZED_VAL) {
    return smallRequest;
  }

  const resourceMap = createResourceMap(spans);

  // Hack to re-use the writer instance (and hence the buffer used for
  // serializing), as a possible perf improvement.
  // TODO(trentm): remove or keep this?
  const HACK_REUSE_WRITER = true;
  let writer;
  if (HACK_REUSE_WRITER) {
    writer = gWriter;
    writer.reset();
  } else {
    writer = new ProtobufWriter();
  }

  // resource_logs (field 1, repeated ResourceLogs)
  for (const [resource, scopeMap] of resourceMap) {
    writer.writeTag(1, 2 /* length-delimited */);
    serializeResourceSpans(writer, resource, scopeMap);
  }

  return writer.finish();
  // XXX
  // const ser = writer.finish();
  // const b64 = Buffer.from(ser).toString('base64');
  // console.log('TraceExportServiceRequest ser: ', b64);
  // return ser;
}
