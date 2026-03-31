'use strict';

var chunk6NYM5ZKZ_cjs = require('./chunk-6NYM5ZKZ.cjs');

// src/core/server/context.ts
var ServerCallContext = class {
  _requestedExtensions;
  _user;
  _activatedExtensions;
  constructor(requestedExtensions, user) {
    this._requestedExtensions = requestedExtensions;
    this._user = user;
  }
  get user() {
    return this._user;
  }
  get activatedExtensions() {
    return this._activatedExtensions;
  }
  get requestedExtensions() {
    return this._requestedExtensions;
  }
  addActivatedExtension(uri) {
    this._activatedExtensions = chunk6NYM5ZKZ_cjs.Extensions.createFrom(this._activatedExtensions, uri);
  }
};

exports.ServerCallContext = ServerCallContext;
