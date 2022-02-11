/**
 * Copyright 2020-2021 EPFL LDS
 * Copyright 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { Injectable } from '@angular/core';
import { AppConfig } from '../../../config/app.config';
import { Observable, forkJoin } from 'rxjs';
import { timeout, map, tap } from 'rxjs/operators';
import { ApiI2b2Panel } from '../../../models/api-request-models/medco-node/api-i2b2-panel';
import { ConstraintMappingService } from '../../constraint-mapping.service';
import { ApiEndpointService } from '../../api-endpoint.service';
import { GenomicAnnotationsService } from '../genomic-annotations.service';
import { ApiExploreQueryResult } from '../../../models/api-response-models/medco-node/api-explore-query-result';
import { MedcoNetworkService } from '../medco-network.service';
import { ExploreQuery } from '../../../models/query-models/explore-query';
import { CryptoService } from '../../crypto.service';
import { ApiNodeMetadata } from '../../../models/api-response-models/medco-network/api-node-metadata';
import { ApiI2b2Timing } from '../../../models/api-request-models/medco-node/api-i2b2-timing';
import { ApiI2b2TimingSequenceInfo } from 'src/app/models/api-request-models/medco-node/api-sequence-of-events/api-i2b2-timing-sequence-info';

@Injectable()
export class ExploreQueryService {

  /**
   * Query timeout: 10 minutes.
   */
  private static QUERY_TIMEOUT_MS = 1000 * 60 * 10;

  /**
   * Last query selection definition used in query that successed to return anything
   */
  private _lastSelectionDefinition: ApiI2b2Panel[]

  /**
   * Last query sequential definition used in query that successed to return anything
   */
   private _lastSequentialDefinition: ApiI2b2Panel[]

  /**
   * Last query timing used in query that successed to return anything
   */
  private _lastQueryTiming: ApiI2b2Timing


  /**
   * Last timing sequence used in query that successed to return anything
   */
  private _lastTimingSequence: ApiI2b2TimingSequenceInfo[]

  constructor(private config: AppConfig,
    private apiEndpointService: ApiEndpointService,
    private medcoNetworkService: MedcoNetworkService,
    private genomicAnnotationsService: GenomicAnnotationsService,
    private constraintMappingService: ConstraintMappingService,
    private cryptoService: CryptoService) { }

  //  ------------------- api calls ----------------------

  /**
   * @returns {Observable<number>} the resultId
   * @param queryId
   * @param queryTiming
   * @param userPublicKey
   * @param panels
   * @param node
   * @param sync
   */
  private exploreQuerySingleNode(queryId: string,
    userPublicKey: string,
    selectionPanels: ApiI2b2Panel[],
    sequentialPanels: ApiI2b2Panel[],
    queryTiming: ApiI2b2Timing,
    queryTimingSequence: ApiI2b2TimingSequenceInfo[],
    node: ApiNodeMetadata,
    sync: boolean = true): Observable<[ApiNodeMetadata, ApiExploreQueryResult]> {
    return this.apiEndpointService.postCall(
      'node/explore/query?sync=' + sync,
      {
        id: queryId,
        query: {
          queryTiming: queryTiming,
          userPublicKey: userPublicKey,
          selectionPanels: selectionPanels,
          sequentialPanels: sequentialPanels,
          queryTimingSequence: queryTimingSequence
        }
      },
      node.url
    ).pipe(map((expQueryResp) => [node, expQueryResp['result']]));
  }

  // -------------------------------------- helper calls --------------------------------------

  /**
   * Execute simultaneously the specified MedCo query on all the nodes.
   * Ensures before execute that the token is still valid.
   *
   * @param queryId
   * @param queryTiming
   * @param userPublicKey
   * @param panels
   */
  private exploreQueryAllNodes(queryId: string,
    userPublicKey: string,
    selectionPanels: ApiI2b2Panel[],
    sequentialPanels: ApiI2b2Panel[],
    queryTiming: ApiI2b2Timing,
    queryTimingSequence: ApiI2b2TimingSequenceInfo[]): Observable<[ApiNodeMetadata, ApiExploreQueryResult][]> {

    return forkJoin(this.medcoNetworkService.nodes.map(
      (node) => this.exploreQuerySingleNode(queryId,
        userPublicKey,
        selectionPanels,
        sequentialPanels,
        queryTiming,
        queryTimingSequence,
        node)
    )).pipe(timeout(ExploreQueryService.QUERY_TIMEOUT_MS));
  }

  /**
   *
   * @param query
   */
  exploreQuery(query: ExploreQuery): Observable<[ApiNodeMetadata, ApiExploreQueryResult][]> {
    let currentSelectionDefinition = this.constraintMappingService.mapConstraint(query.constraint);
    let currentSequentialDefinition = this.constraintMappingService.mapConstraint(query.sequentialConstraint)
    let currentTiming = query.queryTimingSameInstanceNum ? ApiI2b2Timing.sameInstanceNum : ApiI2b2Timing.any;
    let currentTimingSequence= query.sequentialConstraint.temporalSequence

    return this.exploreQueryAllNodes(
      query.uniqueId,
      this.cryptoService.ephemeralPublicKey,
      currentSelectionDefinition,
      currentSequentialDefinition,
      currentTiming,
      query.timingSequenceInfo
    ).pipe(tap(() => {
      this._lastSelectionDefinition = currentSelectionDefinition
      this._lastSequentialDefinition = currentSelectionDefinition
      this._lastQueryTiming = currentTiming
      this._lastTimingSequence = currentTimingSequence
    }));
  }

  get lastSelectionDefinition(): ApiI2b2Panel[]{
    return this._lastSelectionDefinition
  }

  get lastSequentialDefinition(): ApiI2b2Panel[]{
    return this._lastSequentialDefinition
  }

  get lastQueryTiming(): ApiI2b2Timing {
    return this._lastQueryTiming
  }

  get lastTimingSequence(): ApiI2b2TimingSequenceInfo[] {
    return this._lastTimingSequence
  }
}
