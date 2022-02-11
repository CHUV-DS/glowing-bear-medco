/**
 * Copyright 2021 CHUV
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ApiI2b2TimingSequenceInfo } from "../api-request-models/medco-node/api-sequence-of-events/api-i2b2-timing-sequence-info";
import { CompositeConstraint } from "./composite-constraint";

 export class SequentialConstraint extends CompositeConstraint {
  private _temporalSequence: ApiI2b2TimingSequenceInfo[];
  get temporalSequence(): ApiI2b2TimingSequenceInfo[] {
    this.updateSequences()
    return this._temporalSequence
  }

  set temporalSequence(sequenceInfo: ApiI2b2TimingSequenceInfo[]) {
    this._temporalSequence = sequenceInfo
  }

  updateSequences() {
    const nOfChildIntervals = this._children.length - 1
    if (!(this._temporalSequence) || (this._temporalSequence.length === 0)) {
      if (nOfChildIntervals > -1) {
        this._temporalSequence = Array<ApiI2b2TimingSequenceInfo>(nOfChildIntervals)
        for (let i = 0; i < nOfChildIntervals; i++) {
          this._temporalSequence[i] = new ApiI2b2TimingSequenceInfo;
        }
        this._temporalSequence.forEach((_, idx) => { this._temporalSequence[idx] = new ApiI2b2TimingSequenceInfo() })
      }
    } else {

      if (nOfChildIntervals > this._temporalSequence.length) {
        let newSequences = Array<ApiI2b2TimingSequenceInfo>(this._children.length - nOfChildIntervals)
        for (let i = 0; i < this._children.length - nOfChildIntervals; i++) {
          newSequences[i] = new ApiI2b2TimingSequenceInfo;
        }
        this._temporalSequence = this._temporalSequence.concat(newSequences)
      } else if (nOfChildIntervals < this._temporalSequence.length) {
        // this is not expected as this situation can be handled by removeChildren
        this._temporalSequence.splice(nOfChildIntervals, this._temporalSequence.length - nOfChildIntervals)
      }

    }
  }

  clone(): SequentialConstraint {
    let res = new SequentialConstraint();
    res._textRepresentation = this.textRepresentation;
    res.parentConstraint = (this.parentConstraint) ? this.parentConstraint : null;
    res.isRoot = this.isRoot;
    res.excluded = this.excluded
    //res.combinationState = this.combinationState;
    res.temporalSequence = this.temporalSequence.map(sequenceInfo => sequenceInfo.clone());
    res.panelTimingSameInstance = this.panelTimingSameInstance;
    res.children = this.children.map(constr => constr.clone());
    return res;
  }

  get textRepresentation(): string{
    if (this.children.length > 0) {
      let newRepresentation = ''
      for (let index = 0; index < this.children.length; index++) {

        let representation = this.children[index].textRepresentation
        if (index > 0) {
          let combinationRepresentation = (index !== (this.children.length - 1)) ?
          this._temporalSequence[index - 1].textRepresentation :
          ''
          representation = ` ${combinationRepresentation} ${representation}`
        }
        newRepresentation = `${newRepresentation}${representation}`
      }

      return this.excluded ? 'not ' : '' + `(${newRepresentation})`
    } else {
      return 'Group';
    }
    
  }

  get compositeClassName(): string {
    return 'SequentialConstraint';
  }

   
 }