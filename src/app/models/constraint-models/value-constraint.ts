/**
 * Copyright 2017 - 2018  The Hyve B.V.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {Constraint} from './constraint';
import {FormatHelper} from '../../utilities/format-helper';

export class ValueConstraint extends Constraint {

  private _operator: string;
  private _value: any;

  constructor() {
    super();
    this._textRepresentation = 'Value';
  }

  get operator(): string {
    return this._operator;
  }

  set operator(value: string) {
    this._operator = value;
  }

  get value(): any {
    return this._value;
  }

  set value(value: any) {
    this._value = value;
    this._textRepresentation = value ? FormatHelper.nullValuePlaceholder : value.toString();
  }

  get className(): string {
    return 'ValueConstraint';
  }
}
