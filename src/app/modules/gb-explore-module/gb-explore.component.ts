/**
 * Copyright 2017 - 2018  The Hyve B.V.
 * Copyright 2020  LDS EPFL
 * Copyright 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { AfterViewChecked, ChangeDetectorRef, Component } from '@angular/core';
import { FormatHelper } from '../../utilities/format-helper';
import { QueryService } from '../../services/query.service';
import { ExploreQueryType } from '../../models/query-models/explore-query-type';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConstraintService } from '../../services/constraint.service';
import {ApiNodeMetadata} from '../../models/api-response-models/medco-network/api-node-metadata';
import {CohortService} from '../../services/cohort.service';
import {SavedCohortsPatientListService} from '../../services/saved-cohorts-patient-list.service';
import {MessageHelper} from '../../utilities/message-helper';
import {Cohort} from '../../models/cohort-models/cohort';
import {OperationStatus} from '../../models/operation-status';
import {OperationType} from '../../models/operation-models/operation-types';
import {ApiQueryDefinition} from '../../models/api-request-models/medco-node/api-query-definition';
import {MedcoNetworkService} from '../../services/api/medco-network.service';
import {ErrorHelper} from '../../utilities/error-helper';

@Component({
  selector: 'gb-explore',
  templateUrl: './gb-explore.component.html',
  styleUrls: ['./gb-explore.component.css']
})
export class GbExploreComponent implements AfterViewChecked {

  _lastPatientList: [ApiNodeMetadata[], number[][]]

  OperationType = OperationType

  constructor(private queryService: QueryService,
    private cohortService: CohortService,
    private medcoNetworkService: MedcoNetworkService,
    public constraintService: ConstraintService,
    private changeDetectorRef: ChangeDetectorRef,
    private savedCohortsPatientListService: SavedCohortsPatientListService) {
    this.queryService.lastSuccessfulSet.subscribe(resIDs => {
      this.lastSuccessfulSet = resIDs
    })
    this.queryService.queryResults.subscribe(
      result => {
        if ((result) && (result.patientLists)) {
          this._lastPatientList = [result.nodes, result.patientLists];
        }
      }
    )
  }

  // without this, ExpressionChangedAfterItHasBeenCheckedError when going from Analysis to Explore
  ngAfterViewChecked() {
    this.changeDetectorRef.detectChanges()
  }

  execQuery(event) {
    event.stopPropagation();
    this.queryService.execQuery();
  }

  save() {
    if (this.cohortName === '') {
      throw ErrorHelper.handleNewUserInputError('You must provide a name for the cohort you want to save.');
    } else if (!this.cohortService.patternValidation.test(this.cohortName).valueOf()) {
      throw ErrorHelper.handleNewUserInputError(`Name ${this.cohortName} can only contain alphanumerical symbols (without ö é ç ...) and underscores "_".`);
    }

    let existingCohorts = this.cohortService.cohorts
    if (existingCohorts.findIndex((c => c.name === this.cohortName).bind(this)) !== -1) {
      throw ErrorHelper.handleNewUserInputError(`Name ${this.cohortName} already used.`);
    }

    let creationDates = new Array<Date>()
    let updateDates = new Array<Date>()
    let queryDefinitions = new Array<ApiQueryDefinition>()
    const nunc = Date.now()
    for (let i = 0; i < this.medcoNetworkService.nodes.length; i++) {
      creationDates.push(new Date(nunc))
      updateDates.push(new Date(nunc))
      let definition = new ApiQueryDefinition()
      definition.panels = this.queryService.lastDefinition
      definition.queryTiming = this.queryService.lastTiming
      queryDefinitions.push(definition)
    }

    let cohort = new Cohort(
      this.cohortName,
      this.constraintService.rootConstraint,
      creationDates,
      updateDates,
    )
    if (queryDefinitions.some(apiDef => (apiDef.panels) || (apiDef.queryTiming))) {
      cohort.queryDefinition = queryDefinitions
    }
    cohort.patient_set_id = this.lastSuccessfulSet
    this.cohortService.postCohort(cohort)
    MessageHelper.alert('success', 'Cohort successfully saved.');

    // handle patient list locally
    if (this._lastPatientList) {
      this.savedCohortsPatientListService.insertPatientList(this.cohortName, this._lastPatientList[0], this._lastPatientList[1])
      this.savedCohortsPatientListService.statusStorage.set(this.cohortName, OperationStatus.done)
    } else {
      switch (this.queryService.queryType) {
        case ExploreQueryType.COUNT_PER_SITE:
        case ExploreQueryType.COUNT_PER_SITE_OBFUSCATED:
        case ExploreQueryType.COUNT_PER_SITE_SHUFFLED:
        case ExploreQueryType.COUNT_PER_SITE_SHUFFLED_OBFUSCATED:
        case ExploreQueryType.PATIENT_LIST:
          MessageHelper.alert('error', 'There is no patient list cached from previous Explore Query. You may have to download the list again.')
          break;
        default:
          // In this case no patient list is available in the return type of the explore query anyway.
          break;
      }
    }
    this.cohortName = ''
  }

  saveIfEnter(event) {
    if (event.keyCode === 13) {
      this.save()
    }
  }
  // otherwise writes data in input filed
  preventDefault(event: Event) {
    event.preventDefault()
  }

  get queryType(): ExploreQueryType {
    return this.queryService.queryType;
  }

  set lastSuccessfulSet(setIDs: number[]) {
    this.cohortService.lastSuccessfulSet = setIDs
  }
  get lastSuccessfulSet(): number[] {
    return this.cohortService.lastSuccessfulSet
  }
  get globalCount(): Observable<string> {
    return this.queryService.queryResults.pipe(map((queryResults) =>
      queryResults ? FormatHelper.formatCountNumber(queryResults.globalCount) : '0'
    ));
  }
  set cohortName(name: string) {
    this.cohortService.cohortName = name
  }
  get cohortName(): string {
    return this.cohortService.cohortName
  }

  get isUpdating(): boolean {
    return this.queryService.isUpdating
  }

  get isDirty(): boolean {
    return this.queryService.isDirty
  }

  get hasConstraint(): boolean {
    return this.constraintService.hasConstraint().valueOf()
  }


}
