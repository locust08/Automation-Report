declare module "node:sqlite" {
  export type StatementResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export class StatementSync {
    all(...anonymousParameters: unknown[]): unknown[];
    get(...anonymousParameters: unknown[]): unknown;
    run(...anonymousParameters: unknown[]): StatementResult;
  }

  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
