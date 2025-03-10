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

import {
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_CLOUD_AVAILABILITY_ZONE,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_REGION,
  SEMRESATTRS_HOST_ID,
  SEMRESATTRS_HOST_TYPE,
} from '@opentelemetry/semantic-conventions';
import { ResourceDetector } from '../../src';
import { DetectedResource } from '../../src/types';

class SampleDetector implements ResourceDetector {
  detect(): DetectedResource {
    return {
      attributes: {
        [SEMRESATTRS_CLOUD_PROVIDER]: 'provider',
        [SEMRESATTRS_CLOUD_ACCOUNT_ID]: 'accountId',
        [SEMRESATTRS_CLOUD_REGION]: 'region',
        [SEMRESATTRS_CLOUD_AVAILABILITY_ZONE]: 'zone',
        [SEMRESATTRS_HOST_ID]: 'instanceId',
        [SEMRESATTRS_HOST_TYPE]: 'instanceType',
      },
    };
  }
}

export const sampleDetector = new SampleDetector();
