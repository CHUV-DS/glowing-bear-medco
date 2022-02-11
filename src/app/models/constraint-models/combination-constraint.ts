/**
 * Copyright 2017 - 2018  The Hyve B.V.
 *
 * Copyright 2020 - 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Constraint } from './constraint';
import { CombinationState } from './combination-state';
import { CompositeConstraint } from './composite-constraint';

export class CombinationConstraint extends CompositeConstraint {


  private _combinationState: CombinationState;


  constructor() {
    super();
    this.combinationState = CombinationState.And;
  }

  get compositeClassName(): string {
    return 'CombinationConstraint';
  }


  updateChild(index: number, constraint: Constraint) {
    if (!(<CombinationConstraint>constraint).isRoot) {
      constraint.parentConstraint = this;
    }
    this.children[index] = constraint
    return;
  }

  clone(): CombinationConstraint {
    let res = new CombinationConstraint();
    res._textRepresentation = this.textRepresentation;
    res.parentConstraint = (this.parentConstraint) ? this.parentConstraint : null;
    res.isRoot = this.isRoot;
    res.excluded = this.excluded
    res.combinationState = this.combinationState;
    res.panelTimingSameInstance = this.panelTimingSameInstance;
    res.children = this.children.map(constr => constr.clone());
    return res;
  }

  isAnd() {
    return this.combinationState === CombinationState.And;
  }

  /**
   *  the input value validity of a combination constraint is true if all children constraints have valid values.
   *  If one or multiple children are not valid, only the first non-empty message string is returned
   */
  inputValueValidity(): string {

    for (const child of this.children) {
      let validity = child.inputValueValidity()
      if (validity !== '') {
        return validity
      }
    }
    return ''
  }


  get children(): Constraint[] {
    return this._children;
  }

  set children(value: Constraint[]) {
    this._children = value;
  }

  get combinationState(): CombinationState {
    return this._combinationState;
  }

  set combinationState(value: CombinationState) {
    this._combinationState = value;
  }

  switchCombinationState() {
    this.combinationState = (this.combinationState === CombinationState.And) ?
      CombinationState.Or : CombinationState.And;
  }


  get isRoot(): boolean {
    return this._isRoot;
  }

  set isRoot(value: boolean) {
    this._isRoot = value;
  }

  get textRepresentation(): string {
    if (this.children.length > 0) {
      let newRepresentation = ''
      for (let index = 0; index < this.children.length; index++) {

        let representation = this.children[index].textRepresentation
        if (index > 0) {
          let combinationRepresentation = this.combinationState === CombinationState.And ? 'and': 'or'
          representation = ` ${combinationRepresentation} ${representation}`
        }
        newRepresentation = `${newRepresentation}${representation}`
      }

      return this.excluded ? 'not ' : '' + `(${newRepresentation})`
    } else {
      return 'Group';
    }
  }
}
