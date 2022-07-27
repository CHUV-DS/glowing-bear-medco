/**
 * Copyright 2020 - 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { ApiI2b2Panel } from '../medco-node/api-i2b2-panel'
import { ApiI2b2Timing } from '../medco-node/api-i2b2-timing'
import { ApiI2b2TimingSequenceInfo } from '../medco-node/api-sequence-of-events/api-i2b2-timing-sequence-info'

export class ApiSurvivalAnalysis {
  ID: string
  cohortName: string
  subGroupDefinitions: Array<{ groupName: string,
    subGroupTiming: ApiI2b2Timing,
    selectionPanels: Array<ApiI2b2Panel>,
    sequentialPanels: Array<ApiI2b2Panel>,
    queryTimingSequence: Array<ApiI2b2TimingSequenceInfo>}>
  timeLimit: number
  timeGranularity: string
  startConcept: string
  startsWhen: string
  startModifier?: {
    ModifierKey: string
    AppliedPath: string
  }
  endConcept: string
  endModifier?: {
    ModifierKey: string
    AppliedPath: string
  }
  endsWhen: string
  censoringFrom: string
  userPublicKey: string

}
