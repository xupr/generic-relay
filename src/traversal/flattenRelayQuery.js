/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule flattenRelayQuery
 * @flow
 * @typechecks
 */

'use strict';

const Map = require('Map');
const RelayProfiler = require('RelayProfiler');
import type RelayQuery from 'RelayQuery';
const RelayQueryVisitor = require('RelayQueryVisitor');

const sortTypeFirst = require('sortTypeFirst');

type FlattenedQuery = {
  node: RelayQuery.Node;
  type: string;
  flattenedFieldMap: Map<string, FlattenedQuery>;
  flattenedFragmentMap: Map<string, FlattenedQuery>;
};
export type FlattenRelayQueryOptions = {
  shouldRemoveFragments: boolean;
};

/**
 * @internal
 *
 * `flattenRelayQuery(query)` returns a clone of `query` with fields inside of
 * fragments recursively flattened into the nearest ancestor field.
 *
 * The result can be null if `node` only contains empty fragments or fragments
 * that only contain empty fragments.
 */
function flattenRelayQuery<Tn: RelayQuery.Node>(
  node: Tn,
  options?: FlattenRelayQueryOptions
): ?Tn {
  const flattener = new RelayQueryFlattener(
    options && options.shouldRemoveFragments
  );
  const state = {
    node,
    type: node.getType(),
    flattenedFieldMap: new Map(),
    flattenedFragmentMap: new Map(),
  };
  flattener.traverse(node, state);
  return toQuery(node, state);
}

function toQuery<Tn: RelayQuery.Node>(
  node: Tn,
  {
    flattenedFieldMap,
    flattenedFragmentMap,
  }: FlattenedQuery
): ?Tn {
  const children = [];
  const aliases = Array.from(flattenedFieldMap.keys()).sort(sortTypeFirst);
  aliases.forEach(alias => {
    var field = flattenedFieldMap.get(alias);
    if (field) {
      children.push(toQuery(field.node, field));
    }
  });
  Array.from(flattenedFragmentMap.keys()).forEach(type => {
    var fragment = flattenedFragmentMap.get(type);
    if (fragment) {
      children.push(toQuery(fragment.node, fragment));
    }
  });
  return node.clone(children);
}

class RelayQueryFlattener extends RelayQueryVisitor<FlattenedQuery> {
  _shouldRemoveFragments: boolean;

  constructor(shouldRemoveFragments: ?boolean) {
    super();
    this._shouldRemoveFragments = !!shouldRemoveFragments;
  }

  visitFragment(
    node: RelayQuery.Fragment,
    state: FlattenedQuery
  ): void {
    const type = node.getType();
    if (this._shouldRemoveFragments || type === state.type) {
      this.traverse(node, state);
      return;
    }
    let flattenedFragment = state.flattenedFragmentMap.get(type);
    if (!flattenedFragment) {
      flattenedFragment = {
        node,
        type,
        flattenedFieldMap: new Map(),
        flattenedFragmentMap: new Map(),
      };
      state.flattenedFragmentMap.set(type, flattenedFragment);
    }
    this.traverse(node, flattenedFragment);
  }

  visitField(
    node: RelayQuery.Field,
    state: FlattenedQuery
  ): void {
    var hash = node.getShallowHash();
    var flattenedField = state.flattenedFieldMap.get(hash);
    if (!flattenedField) {
      flattenedField = {
        node,
        type: node.getType(),
        flattenedFieldMap: new Map(),
        flattenedFragmentMap: new Map(),
      };
      state.flattenedFieldMap.set(hash, flattenedField);
    }
    this.traverse(node, flattenedField);
  }
}

module.exports = RelayProfiler.instrument(
  'flattenRelayQuery',
  flattenRelayQuery
);
