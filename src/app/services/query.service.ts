/**
 * Copyright 2017 - 2018  The Hyve B.V.
 * Copyright 2019 - 2021 LDS EPFL
 * Copyright 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Injectable, Query } from '@angular/core';
import { TreeNodeService } from './tree-node.service';
import { ExploreQuery } from '../models/query-models/explore-query';
import { ConstraintService } from './constraint.service';
import { AppConfig } from '../config/app.config';
import { ExploreQueryType } from '../models/query-models/explore-query-type';
import { AuthenticationService } from './authentication.service';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ExploreQueryService } from './api/medco-node/explore-query.service';
import { ApiExploreQueryResult } from '../models/api-response-models/medco-node/api-explore-query-result';
import { CryptoService } from './crypto.service';
import { GenomicAnnotationsService } from './api/genomic-annotations.service';
import { ExploreQueryResult } from '../models/query-models/explore-query-result';
import { Observable, ReplaySubject, throwError, Subject, of } from 'rxjs';
import { ErrorHelper } from '../utilities/error-helper';
import { MessageHelper } from '../utilities/message-helper';
import { ApiNodeMetadata } from '../models/api-response-models/medco-network/api-node-metadata';
import { ApiI2b2Panel } from '../models/api-request-models/medco-node/api-i2b2-panel';
import { ApiI2b2Timing } from '../models/api-request-models/medco-node/api-i2b2-timing';
import { OperationType } from '../models/operation-models/operation-types';
import { UserInputError } from '../utilities/user-input-error';
import { QueryTemporalSetting } from '../models/query-models/query-temporal-setting';
import { ApiI2b2TimingSequenceInfo } from '../models/api-request-models/medco-node/api-sequence-of-events/api-i2b2-timing-sequence-info';

/**
 * This service concerns with updating subject counts.
 */
@Injectable()
export class QueryService {

  // the currently selected query
  private _query: ExploreQuery;

  // the query type the user is authorized to
  private _queryType: ExploreQueryType;

  // the current query results
  private readonly _queryResults: ReplaySubject<ExploreQueryResult>;

  // flag indicating if the counts are being updated
  private _isUpdating;

  // flag indicating if the query has been changed
  private _isDirty;

  private _lastSuccessfulSet = new Subject<number[]>()

  // i2b2 query-level timing policy
  private _queryTiming = QueryTemporalSetting.independent;

  // keep track queryTiming when switching tab
  private _exploreQueryTiming: QueryTemporalSetting;


  constructor(private appConfig: AppConfig,
    private treeNodeService: TreeNodeService,
    private constraintService: ConstraintService,
    private exploreQueryService: ExploreQueryService,
    private authService: AuthenticationService,
    private cryptoService: CryptoService,
    private genomicAnnotationsService: GenomicAnnotationsService) {
    this._queryResults = new ReplaySubject<ExploreQueryResult>(1);
    this.clearAll();
  }

  clearAll() {
    this.queryResults.next();
    this.isUpdating = false;
    this.isDirty = false;
    this.queryTiming = QueryTemporalSetting.independent;
    this.constraintService.clearConstraint();
    this.query = new ExploreQuery();
  }

  /**
   * Parse and decrypt results from MedCo nodes.
   */
  private parseExploreQueryResults(encResults: [ApiNodeMetadata, ApiExploreQueryResult][]): Observable<ExploreQueryResult> {
    if (encResults.length === 0) {
      return throwError(ErrorHelper.handleNewError('Empty results, no processing done'));
    }

    let queryResult: Observable<ExploreQueryResult>;
    switch (this.queryType) {
      case ExploreQueryType.COUNT_GLOBAL:
      case ExploreQueryType.COUNT_GLOBAL_OBFUSCATED:
        queryResult = this.cryptoService.decryptIntegersWithEphemeralKey([encResults[0][1].encryptedCount]).pipe(
          map(decrypted => {
            let parsedResults = new ExploreQueryResult();
            parsedResults.nodes = encResults.map(res => res[0]);
            parsedResults.globalCount = decrypted[0];
            parsedResults.resultInstanceID = encResults.map(result => result[1].queryID)
            return parsedResults;
          })
        );
        break;

      case ExploreQueryType.COUNT_PER_SITE:
      case ExploreQueryType.COUNT_PER_SITE_OBFUSCATED:
      case ExploreQueryType.COUNT_PER_SITE_SHUFFLED:
      case ExploreQueryType.COUNT_PER_SITE_SHUFFLED_OBFUSCATED:
      case ExploreQueryType.PATIENT_LIST:
        queryResult = this.cryptoService.decryptIntegersWithEphemeralKey(encResults.map(result => result[1].encryptedCount))
          .pipe(
            map(decrypted => {
              let parsedResults = new ExploreQueryResult();
              parsedResults.nodes = encResults.map(res => res[0]);
              parsedResults.perSiteCounts = decrypted;
              parsedResults.globalCount = parsedResults.perSiteCounts.reduce((a, b) => a + b, 0);
              parsedResults.resultInstanceID = encResults.map(result => result[1].queryID)
              return parsedResults;
            }),
            switchMap(parsedResults => {
              if (this.queryType === ExploreQueryType.PATIENT_LIST) {
                // decrypt patient lists if they are present
                const encPatientLists = encResults.map(result =>
                  result[1].encryptedPatientList ? result[1].encryptedPatientList : []
                );

                return this.cryptoService.decryptIntegersWithEphemeralKey(
                  encPatientLists.reduce((prevArray, currArray) => prevArray.concat(currArray))
                ).pipe(
                  tap(decrypted => {
                    parsedResults.patientLists = [];
                    encPatientLists.forEach(encPatientList => parsedResults.patientLists.push(
                      decrypted.splice(0, encPatientList.length)
                    ));
                  }),
                  map(() => parsedResults)
                );
              } else {
                return of(parsedResults);
              }
            })
          );
        break;

      default:
        return throwError(ErrorHelper.handleNewError(`unknown explore query type: ${this.queryType}`))
    }

    return queryResult.pipe(tap(parsedResults => {
      if (parsedResults.globalCount === 0) {
        MessageHelper.alert('success', 'No patients found matching this query');
      }

      console.log(`Parsed results of ${encResults.length} nodes with a global count of ${parsedResults.globalCount}`);
    }))
  }

  public execQuery(): void {

    if (!this.constraintService.hasSelectionConstraint()) {
      MessageHelper.alert('warn', 'No constraints specified, please correct.');
      return;
    } else if (!this.queryType) {
      MessageHelper.alert('warn', 'No authorized query type.');
      return;
    }

    // validate user input

    let validity = this.constraintService.validateConstraintValues()
    if (validity !== '') {
      ErrorHelper.handleNewUserInputError(validity);
      return;
    }

    this.isUpdating = true;

    // prepare and execute query
    this.query.generateUniqueId();
    this.query.constraint = this.constraintService.generateConstraint();
    this.query.sequentialConstraint = this.constraintService.rootSequentialConstraint;
    this.query.queryTimingSameInstanceNum = this.queryTiming === QueryTemporalSetting.sameinstance

    this.genomicAnnotationsService.addVariantIdsToConstraints(this.query.constraint).pipe(
      catchError((err) => {
        MessageHelper.alert('warn', 'Invalid genomic annotation in query, please correct.');
        return throwError(err);
      }),
      switchMap(() => this.exploreQueryService.exploreQuery(this.query)),
      switchMap(results => this.parseExploreQueryResults(results))
    ).subscribe(
      (parsedResults: ExploreQueryResult) => {
        if (parsedResults.resultInstanceID) {
          this._lastSuccessfulSet.next(parsedResults.resultInstanceID)
        }
        this.queryResults.next(parsedResults);
        this.isUpdating = false;
        this.isDirty = this.constraintService.hasSelectionConstraint().valueOf();
      },
      (err) => {
        if (err instanceof UserInputError) {
          console.warn(`[EXPLORE] Interrupted explore query ${this.query.uniqueId} due to user input error.`, err);
        } else {
          ErrorHelper.handleError(`Error during explore query ${this.query.uniqueId}.`, err);
        }
        this.isUpdating = false;
        this.isDirty = true;
      }
    );
  }

  get query(): ExploreQuery {
    return this._query;
  }

  set query(value: ExploreQuery) {
    this._query = value;
  }

  get queryResults(): ReplaySubject<ExploreQueryResult> {
    return this._queryResults;
  }

  get isUpdating(): boolean {
    return this._isUpdating;
  }

  set isUpdating(value: boolean) {
    this._isUpdating = value;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  set isDirty(value: boolean) {
    this._isDirty = value;
  }

  // get the query type from the user's authorizations
  get queryType(): ExploreQueryType {

    if (this._queryType) {
      return this._queryType;
    }

    // map authorization to query type
    let authorizedTypes = this.authService.userRoles.map((role) => {
      switch (role) {
        case ExploreQueryType.PATIENT_LIST.id:
          return ExploreQueryType.PATIENT_LIST;

        case ExploreQueryType.COUNT_PER_SITE.id:
          return ExploreQueryType.COUNT_PER_SITE;

        case ExploreQueryType.COUNT_PER_SITE_OBFUSCATED.id:
          return ExploreQueryType.COUNT_PER_SITE_OBFUSCATED;

        case ExploreQueryType.COUNT_PER_SITE_SHUFFLED.id:
          return ExploreQueryType.COUNT_PER_SITE_SHUFFLED;

        case ExploreQueryType.COUNT_PER_SITE_SHUFFLED_OBFUSCATED.id:
          return ExploreQueryType.COUNT_PER_SITE_SHUFFLED_OBFUSCATED;

        case ExploreQueryType.COUNT_GLOBAL_OBFUSCATED.id:
          return ExploreQueryType.COUNT_GLOBAL_OBFUSCATED;

        case ExploreQueryType.COUNT_GLOBAL.id:
          return ExploreQueryType.COUNT_GLOBAL;

        default:
          return null;
      }
    }).filter((role) => role !== null);

    if (authorizedTypes.length === 0) {
      console.log(`User ${this.authService.username} has no explore query types available.`);
      return undefined;
    }

    // select the most permissive query type
    this._queryType = authorizedTypes.reduce((prevRole, curRole) => {
      if (!prevRole || curRole.weight > prevRole.weight) {
        return curRole;
      } else {
        return prevRole;
      }
    })

    console.log(`User ${this.authService.username} has explore query types: ${authorizedTypes}, selected ${this._queryType}`);
    return this._queryType;
  }


  /**
   * Whether of not the explore results component should be visible.
   */
  get displayExploreResultsComponent(): Observable<boolean> {
    return this.queryResults.pipe(map((queryResults) =>
      queryResults !== undefined && this.queryType.hasPerSiteCounts && queryResults.globalCount > 0));
  }

  get lastSuccessfulSet(): Observable<number[]> {
    return this._lastSuccessfulSet.asObservable()
  }
  get queryTiming(): QueryTemporalSetting {
    return this._queryTiming
  }

  set queryTiming(val: QueryTemporalSetting) {
    this._queryTiming = val
  }

  set sequentialInfo(val: ApiI2b2TimingSequenceInfo[]) {
    this.constraintService.sequentialInfo = val
  }

  get lastSelectionDefinition(): ApiI2b2Panel[] {
    return this.exploreQueryService.lastSelectionDefinition
  }

  get lastSequenceDefinition(): ApiI2b2Panel[] {
    return this.exploreQueryService.lastSequentialDefinition
  }

  get lastTiming(): ApiI2b2Timing {
    return this.exploreQueryService.lastQueryTiming
  }

  get lastTimingSequence(): ApiI2b2TimingSequenceInfo[] {
    return this.exploreQueryService.lastTimingSequence
  }

  set operationType(opType: OperationType) {
    switch (opType) {
      case OperationType.EXPLORE:

        // reload previous selection
        if (this.operationType === OperationType.ANALYSIS) {
          if (this._exploreQueryTiming !== null) {
            this.queryTiming = this._exploreQueryTiming
          }
        }

        this.constraintService.operationType = opType
        break;
      case OperationType.ANALYSIS:

        // save current selection
        if (this.operationType === OperationType.EXPLORE) {
          this._exploreQueryTiming = this.queryTiming
          this.queryTiming = QueryTemporalSetting.independent
        }
        this.constraintService.operationType = opType
        break;
      default:

        // do nothing constraint service already warns about it
        break;
    }

  }

  get operationType(): OperationType {
    return this.constraintService.operationType
  }

}
