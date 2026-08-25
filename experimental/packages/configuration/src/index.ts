/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { ConfigFactory } from './IConfigFactory';
export type {
  ConfigurationModel,
  LogRecordExporter as LogRecordExporterConfigModel,
  PushMetricExporter as PushMetricExporterConfigModel,
  OtlpHttpMetricExporter as OtlpHttpMetricExporterConfigModel,
  OtlpGrpcMetricExporter as OtlpGrpcMetricExporterConfigModel,
  InstrumentType as InstrumentTypeConfigModel,
  Aggregation as AggregationConfigModel,
  PeriodicMetricReader as PeriodicMetricReaderConfigModel,
  Sampler as SamplerConfigModel,
  SpanExporter as SpanExporterConfigModel,
  SpanProcessor as SpanProcessorConfigModel,
  SpanLimits as SpanLimitsConfigModel,
  MetricProducer as MetricProducerConfigModel,
  NameStringValuePair as NameStringValuePairConfigModel,
  HttpTls as HttpTlsConfigModel,
  GrpcTls as GrpcTlsConfigModel,
  IdGenerator as IdGeneratorConfigModel,
  SeverityNumber as SeverityNumberConfigModel,
  TextMapPropagator as TextMapPropagatorConfigModel,
  LoggerProvider as LoggerProviderConfigModel,
  AttributeLimits as AttributeLimitsConfigModel,
  LogRecordProcessor as LogRecordProcessorConfigModel,
  BatchLogRecordProcessor as BatchLogRecordProcessorConfigModel,
  SimpleLogRecordProcessor as SimpleLogRecordProcessorConfigModel,
  OtlpHttpExporter as OtlpHttpExporterConfigModel,
  OtlpGrpcExporter as OtlpGrpcExporterConfigModel,
  LogRecordLimits as LogRecordLimitsConfigModel,
  ExperimentalInstrumentation as ExperimentalInstrumentationConfigModel,
  ExperimentalLanguageSpecificInstrumentation as ExperimentalLanguageSpecificInstrumentationConfigModel,
  ExperimentalGeneralInstrumentation as ExperimentalGeneralInstrumentationConfigModel,
  ExperimentalHttpInstrumentation as ExperimentalHttpInstrumentationConfigModel,
  ExperimentalCodeInstrumentation as ExperimentalCodeInstrumentationConfigModel,
  ExperimentalDbInstrumentation as ExperimentalDbInstrumentationConfigModel,
  ExperimentalGenAiInstrumentation as ExperimentalGenAiInstrumentationConfigModel,
  ExperimentalMessagingInstrumentation as ExperimentalMessagingInstrumentationConfigModel,
  ExperimentalRpcInstrumentation as ExperimentalRpcInstrumentationConfigModel,
  ExperimentalSanitization as ExperimentalSanitizationConfigModel,
} from './generated/types';
export { createConfigFactory } from './ConfigFactory';
export { createConfigProvider } from './SdkConfigProvider';
export {
  mergeResourceAttributesConfig,
  mergePropagatorCompositeConfig,
} from './FileConfigFactory';
