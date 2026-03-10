class Store {
  constructor(options = {}) {
    this._data = new Map();
    this._schema = options.schema || {};

    // Initialize defaults from schema
    for (const [key, def] of Object.entries(this._schema)) {
      if (def.default !== undefined) {
        this._data.set(key, JSON.parse(JSON.stringify(def.default)));
      }
    }
  }

  get(key, defaultValue) {
    // Support dotted paths like 'userPreferences.theme'
    const parts = key.split('.');
    let value = this._data.get(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      if (value === undefined || value === null) return defaultValue;
      value = value[parts[i]];
    }

    return value !== undefined ? value : defaultValue;
  }

  set(key, value) {
    const parts = key.split('.');

    if (parts.length === 1) {
      this._data.set(key, value);
      return;
    }

    // Dotted path: set nested property
    let obj = this._data.get(parts[0]);
    if (obj === undefined || obj === null) {
      obj = {};
      this._data.set(parts[0], obj);
    }

    let current = obj;
    for (let i = 1; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) current[parts[i]] = {};
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
  }

  delete(key) {
    this._data.delete(key);
  }

  has(key) {
    return this._data.has(key);
  }

  clear() {
    this._data.clear();
  }
}

module.exports = Store;
