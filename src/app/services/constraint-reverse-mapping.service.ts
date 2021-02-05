/**
 * Copyright 2020 - 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Constraint } from '../models/constraint-models/constraint';
import { ApiI2b2Panel } from '../models/api-request-models/medco-node/api-i2b2-panel';
import { Injectable } from '@angular/core';
import { CombinationConstraint } from 'app/models/constraint-models/combination-constraint';
import { ConceptConstraint } from 'app/models/constraint-models/concept-constraint';
import { ApiI2b2Timing } from 'app/models/api-request-models/medco-node/api-i2b2-timing';
import { ApiI2b2Item } from 'app/models/api-request-models/medco-node/api-i2b2-item';
import { CombinationState } from 'app/models/constraint-models/combination-state';
import { ConstraintService } from './constraint.service';
import { Observable, of } from 'rxjs';
import { modifiedConceptPath } from 'app/utilities/constraint-utilities/modified-concept-path';
import { ExploreSearchService } from './api/medco-node/explore-search.service';
import { map } from 'rxjs/operators';
import { DropMode } from 'app/models/drop-mode';
import { TreeNode } from 'app/models/tree-models/tree-node';
import { forkJoin } from 'rxjs';



@Injectable()
export class ConstraintReverseMappingService {

  constructor(private constraintService: ConstraintService, private exploreSearchService: ExploreSearchService) { }
  /**
   *
   * Maps an array of panels to a constraint if the panels are fully composed
   * of clear concepts. If one or more encrypted concepts are found, null is returned instead.
   *
   * @param panels
   * @param targetPanelTiming
   * @param nots
   */
  public mapPanels(panels: ApiI2b2Panel[], targetPanelTiming: ApiI2b2Timing[], nots: boolean[]): Observable<Constraint> {
    targetPanelTiming = new Array<ApiI2b2Timing>(panels.length)
    targetPanelTiming.fill(ApiI2b2Timing.any)
    nots = new Array<boolean>(panels.length)
    nots.fill(false)

    if (panels.length === 1 && panels[0].items.length === 1) {

      return this.mapItem(panels[0].items[0]).pipe(map(constraint => {
        constraint.panelTimingSameInstance = panels[0].panelTiming === ApiI2b2Timing.sameInstanceNum
        return constraint
      }))

    } else {

      return forkJoin(panels.map(panel => this.mapPanel(panel))).pipe(map(constraints => {
        let combinationConstraint = new CombinationConstraint()
        constraints.forEach(constraint => { combinationConstraint.addChild(constraint) })
        combinationConstraint.combinationState = CombinationState.And
        return combinationConstraint

      }))

    }
  }

  /**
   *
   * Maps one panel to a constraint if the panel is fully composed
   * of clear concepts and returns false.
   * If one or more encrypted concepts are found, null is set instead and true is returned.
   *
   * @param panelTiming
   * @param panel
   * @param target
   */
  private mapPanel(panel: ApiI2b2Panel): Observable<Constraint> {
    for (const item of panel.items) {
      if (item.encrypted) {
        // restoration of encrypted concept is not supported
        return null
      }
    }
    let sameInstance = panel.panelTiming === ApiI2b2Timing.sameInstanceNum
    if (panel.items.length === 1) {
      return this.mapItem(panel.items[0]).pipe(map(constraint => {
        constraint.panelTimingSameInstance = sameInstance
        return constraint
      }))
    } else {
      return forkJoin(panel.items.map(item => this.mapItem(item))).pipe(map(constraints => {
        let combinationConstraint = new CombinationConstraint()
        constraints.forEach(constraint => { combinationConstraint.addChild(constraint) })
        combinationConstraint.combinationState = CombinationState.Or
        combinationConstraint.panelTimingSameInstance = sameInstance
        return combinationConstraint
      }
      ))
    }
  }

  private mapItem(item: ApiI2b2Item): Observable<ConceptConstraint> {
    let modificated: Observable<TreeNode>
    let resTreeNode: Observable<TreeNode>
    if (item.encrypted === true) {
      // this should have been checked out before
      return null
    }
    let conceptURI = item.modifier ? modifiedConceptPath(item.queryTerm, item.modifier.modifierKey) : item.queryTerm
    // check if the concept is already loaded
    let existingConstraint = this.constraintService.allConstraints.find(
      value => (value instanceof ConceptConstraint) && ((<ConceptConstraint>value).concept.path === conceptURI))
    if (existingConstraint) {
      return of(existingConstraint as ConceptConstraint)
    }
    // else, get details
    let obs = (item.modifier) ?
      this.exploreSearchService.exploreSearchModifierInfo(item.modifier.modifierKey, item.modifier.appliedPath, item.queryTerm) :
      this.exploreSearchService.exploreSearchConceptInfo(item.queryTerm)

    let treeNodeObs = obs.pipe(map(treenodes => {
      switch (treenodes.length) {
        case 0:
          return null
        case 1:
          return treenodes[0]
        default:
          return treenodes[0]
      }
    }))
    if (item.modifier) {
      let modificandum = new ApiI2b2Item()
      modificandum.encrypted = item.encrypted
      modificandum.modifier = null
      modificandum.operator = item.operator
      modificandum.value = item.value
      modificandum.queryTerm = item.queryTerm
      modificated = this.mapItem(modificandum).pipe(map(({ treeNode }) => treeNode))

      resTreeNode = forkJoin([treeNodeObs, modificated]).pipe(map(([modifierNode, modificatedNode]) => {
        modifierNode.appliedConcept = modificatedNode.clone()
        return modifierNode
      }))
    } else {
      resTreeNode = treeNodeObs
    }
    return resTreeNode.pipe(
      map(treenode => this.constraintService.generateConstraintFromTreeNode(treenode, DropMode.TreeNode) as ConceptConstraint)
    )
  }
}