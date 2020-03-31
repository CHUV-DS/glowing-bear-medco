/**
 * Copyright 2017 - 2018  The Hyve B.V.
 * Copyright 2019 - 2020 LDS EPFL
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {Injectable} from '@angular/core';
import {TreeNodeService} from './tree-node.service';
import {ExploreQuery} from '../models/query-models/explore-query';
import {ConstraintService} from './constraint.service';
import {AppConfig} from '../config/app.config';
import {ExploreQueryType} from '../models/query-models/explore-query-type';
import {AuthenticationService} from './authentication.service';
import {catchError, map, switchMap} from 'rxjs/operators';
import {ExploreQueryService} from './api/medco-node/explore-query.service';
import {ApiExploreQueryResult} from '../models/api-response-models/medco-node/api-explore-query-result';
import {CryptoService} from './crypto.service';
import {GenomicAnnotationsService} from './api/genomic-annotations.service';
import {ExploreQueryResult} from '../models/query-models/explore-query-result';
import {Observable, ReplaySubject, throwError} from 'rxjs';
import {ErrorHelper} from '../utilities/error-helper';
import {MessageHelper} from '../utilities/message-helper';

/**
 * This service concerns with updating subject counts.
 */
@Injectable()
export class QueryService {

  // the currently selected query
  private _query: ExploreQuery;

  // the current query results
  private readonly _queryResults: ReplaySubject<ExploreQueryResult>;

  // list of available query types
  private _availableExploreQueryTypes: ExploreQueryType[];

  // flag indicating if the counts are being updated
  private _isUpdating;

  // flag indicating if the query has been changed
  private _isDirty;

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
    this.constraintService.clearConstraint();
    this.query = new ExploreQuery();
  }

  /**
   * Parse and decrypt results from MedCo nodes.
   */
  private parseExploreQueryResults(encResults: ApiExploreQueryResult[]): ExploreQueryResult {
    if (encResults.length === 0) {
      throw ErrorHelper.handleNewError('Empty results, no processing done');
    }

    let parsedResults = new ExploreQueryResult();
    switch (this.query.type) {
      case ExploreQueryType.COUNT_GLOBAL:
      case ExploreQueryType.COUNT_GLOBAL_OBFUSCATED:
        parsedResults.globalCount = this.cryptoService.decryptIntegerWithEphemeralKey(encResults[0].encryptedCount);
        break;

      case ExploreQueryType.COUNT_PER_SITE:
      case ExploreQueryType.COUNT_PER_SITE_OBFUSCATED:
      case ExploreQueryType.COUNT_PER_SITE_SHUFFLED:
      case ExploreQueryType.COUNT_PER_SITE_SHUFFLED_OBFUSCATED:
      case ExploreQueryType.PATIENT_LIST:
        parsedResults.perSiteCounts = encResults.map((result) => this.cryptoService.decryptIntegerWithEphemeralKey(result.encryptedCount));
        parsedResults.globalCount = parsedResults.perSiteCounts.reduce((a, b) => a + b);
        break;

      default:
        throw ErrorHelper.handleNewError(`unknown explore query type: ${this.query.type}`);
    }

    if (this.query.type === ExploreQueryType.PATIENT_LIST) {
      parsedResults.patientLists = encResults.map((result) =>
        result.encryptedPatientList.map((encryptedPatientID) =>
          this.cryptoService.decryptIntegerWithEphemeralKey(encryptedPatientID)
      ));
    }

    console.log(`Parsed results of ${encResults.length} nodes with a global count of ${parsedResults.globalCount}`);
    return parsedResults;
  }

  public execQuery(): void {
    if (!this.constraintService.hasConstraint()) {
      MessageHelper.alert('warn', 'No constraints specified, please correct.');
      return;
    } else if (!this.query.type) {
      MessageHelper.alert('warn', 'No query type specified, please correct.');
      return;
    }

    this.isUpdating = true;

    // prepare and execute query
    this.query.generateUniqueId();
    this.query.constraint = this.constraintService.generateConstraint();

    this.genomicAnnotationsService.addVariantIdsToConstraints(this.query.constraint).pipe(
      catchError((err) => {
        MessageHelper.alert('warn', 'Invalid genomic annotation in query, please correct.');
        return throwError(err);
      }),
      switchMap( () => this.exploreQueryService.exploreQuery(this.query))
    ).subscribe(
      (results: ApiExploreQueryResult[]) => {
        this.queryResults.next(this.parseExploreQueryResults(results));
        this.isUpdating = false;
        this.isDirty = false;
      },
      (err) => {
        ErrorHelper.handleError(`Error during explore query ${this.query.uniqueId}`, err);
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

  get availableExploreQueryTypes(): ExploreQueryType[] {

    if (this._availableExploreQueryTypes) {
      return this._availableExploreQueryTypes
    }

    this._availableExploreQueryTypes = this.authService.userRoles.map((role) => {
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

        case ExploreQueryType.COUNT_GLOBAL.id:
          return ExploreQueryType.COUNT_GLOBAL;

        case ExploreQueryType.COUNT_GLOBAL_OBFUSCATED.id:
          return ExploreQueryType.COUNT_GLOBAL_OBFUSCATED;

        default:
          return null;
      }
    }).filter((role) => role !== null);

    console.log(`User ${this.authService.username} explore query types: ${this._availableExploreQueryTypes}`);
    return this._availableExploreQueryTypes;
  }


  /**
   * Whether of not the explore results component should be visible.
   */
  get displayExploreResultsComponent(): Observable<boolean> {
    return this.queryResults.pipe(map((queryResults) =>
      queryResults !== undefined && this.query.hasPerSiteCounts && queryResults.globalCount > 0));
  }
}
