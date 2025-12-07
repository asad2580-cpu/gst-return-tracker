// server/types/better-sqlite3.d.ts
/**
 * Minimal declaration for `better-sqlite3` so TS knows the default export.
 * This intentionally uses very permissive `any` types so you can iterate quickly.
 * You can refine types later if you want.
 */
declare module "better-sqlite3" {
  interface DatabaseOptions {
    readonly readonly?: boolean;
    readonly fileMustExist?: boolean;
    readonly timeout?: number;
  }

  class Database {
    constructor(filename: string | Buffer, options?: DatabaseOptions);
    prepare(sql: string): { run: (...args: any[]) => any; all: (...args: any[]) => any; get: (...args: any[]) => any };
    // minimal methods used by the project — add more as needed
    close(): void;
  }

  export default Database;
}
