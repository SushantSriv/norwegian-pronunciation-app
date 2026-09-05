/**
 * Enough of Cloudflare D1 to run the real worker against the real schema.
 *
 * D1 is SQLite with a promise-shaped API in front of it, and Node ships SQLite
 * now — so the worker under test can talk to an actual database executing the
 * actual statements from schema.sql. That is the difference between "the
 * TypeScript compiles" and "the SQL is correct", and the SQL is where the
 * interesting mistakes live: a column that does not exist, a bind order that
 * silently swaps two parameters, an ON CONFLICT that never fires.
 *
 * Test and local-development support only. It is never shipped, and the worker
 * does not import it — the dependency runs the other way.
 */
import { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

class Statement {
    // Written out rather than declared as constructor parameters: the project
    // compiles with erasableSyntaxOnly, which rules out parameter properties.
    private readonly db: DatabaseSync;
    private readonly sql: string;
    private readonly values: unknown[];

    constructor(db: DatabaseSync, sql: string, values: unknown[] = []) {
        this.db = db;
        this.sql = sql;
        this.values = values;
    }

    bind(...values: unknown[]): Statement {
        return new Statement(this.db, this.sql, values);
    }

    /** node:sqlite rejects undefined; D1 treats it as NULL. */
    private get params(): unknown[] {
        return this.values.map(value => (value === undefined ? null : value));
    }

    async first<T>(): Promise<T | null> {
        const row = this.db.prepare(this.sql).get(...(this.params as never[]));
        return (row as T) ?? null;
    }

    async all<T>(): Promise<{ results: T[] }> {
        return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
    }

    async run(): Promise<unknown> {
        return this.db.prepare(this.sql).run(...(this.params as never[]));
    }
}

export interface TestDatabase {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown[]>;
    /** Direct access, for arranging a test's starting state. */
    exec(sql: string): void;
    rows(sql: string): Row[];
    close(): void;
}

/**
 * A database with schema.sql applied.
 *
 * @param file ':memory:' for a throwaway one, or a path to keep it.
 */
export function createTestDatabase(schema: string, file = ':memory:'): TestDatabase {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(schema);

    return {
        prepare: (sql: string) => new Statement(db, sql),
        async batch(statements: Statement[]) {
            // D1 batches are a single transaction; so is this, which is what
            // makes the all-or-nothing claim in the worker testable.
            db.exec('BEGIN');
            try {
                const out: unknown[] = [];
                for (const statement of statements) out.push(await statement.run());
                db.exec('COMMIT');
                return out;
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        },
        exec: (sql: string) => db.exec(sql),
        rows: (sql: string) => db.prepare(sql).all() as Row[],
        close: () => db.close(),
    };
}
