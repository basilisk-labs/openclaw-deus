// Mock SurrealDB for unit tests
export default class Surreal {
  async connect() {}
  async close() {}
  async signin() {}
  async use() {}
  async query() { return []; }
  async select() { return []; }
  async create() { return {}; }
  async merge() { return {}; }
  async delete() {}
}
