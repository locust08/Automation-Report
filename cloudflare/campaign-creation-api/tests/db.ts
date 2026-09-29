import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
export async function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../migrations/0001_paused_campaigns.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/0002_immutable_revisions.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/0003_creation_outbox.sql', import.meta.url), 'utf8'));
  class Statement {
    values: any[] = [];
    constructor(readonly sql: string) {}
    bind(...values: any[]) {this.values = values; return this;}
    async first() {return sqlite.prepare(this.sql).get(...this.values) ?? null;}
    async all() {return {success: true, results: sqlite.prepare(this.sql).all(...this.values)};}
    async run() {const value = sqlite.prepare(this.sql).run(...this.values); return {success: true, meta: {changes: Number(value.changes)}};}
  }
  const wrapper = {
    prepare(sql: string) {return new Statement(sql);},
    withSession(mode: string) {if (mode !== 'first-primary') throw new Error('Primary required'); return wrapper;},
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {const result = statements.map(statement => ({success: true, results: sqlite.prepare(statement.sql).all(...statement.values)})); sqlite.exec('COMMIT'); return result;}
      catch (error) {sqlite.exec('ROLLBACK'); throw error;}
    },
  };
  return {db: wrapper as unknown as D1Database, dispose: () => sqlite.close()};
}
