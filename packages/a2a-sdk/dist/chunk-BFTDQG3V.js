import { Extensions } from './chunk-TT7THEVJ.js';

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
    this._activatedExtensions = Extensions.createFrom(this._activatedExtensions, uri);
  }
};

export { ServerCallContext };
