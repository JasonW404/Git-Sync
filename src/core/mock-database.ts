interface TableRow {
  id: number;
  [key: string]: unknown;
}

interface MockTable {
  rows: TableRow[];
  lastIndex: number;
}

export class MockDatabase {
  private tables: Map<string, MockTable> = new Map();
  private lastInsertId = 0;

  exec(sql: string): void {
    const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (tableMatch) {
      this.tables.set(tableMatch[1], { rows: [], lastIndex: 0 });
    }
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(sql.toLowerCase(), this.tables, () => this.lastInsertId);
  }

  transaction(fn: () => void): () => void {
    return fn;
  }

  close(): void {}
}

class MockStatement {
  private sql: string;
  private tables: Map<string, MockTable>;
  private getLastInsertId: () => number;

  constructor(
    sql: string,
    tables: Map<string, MockTable>,
    getLastInsertId: () => number
  ) {
    this.sql = sql;
    this.tables = tables;
    this.getLastInsertId = getLastInsertId;
  }

  run(...args: unknown[]): void {
    const tableName = this.getTableName();
    const table = this.tables.get(tableName);
    if (!table) return;

    if (this.sql.includes('insert')) {
      const columns = this.getInsertColumns();
      table.lastIndex++;
      const row: TableRow = { id: table.lastIndex };
      
      columns.forEach((col, i) => {
        row[col] = args[i];
      });
      
      table.rows.push(row);
    } else if (this.sql.includes('update')) {
      const columns = this.getUpdateColumns();
      const whereCols = this.getWhereColumns();
      const whereArgsStart = columns.length;
      
      table.rows.forEach((row) => {
        if (this.matchesAllWhere(row, whereCols, args, whereArgsStart)) {
          columns.forEach((col, i) => {
            row[col] = args[i];
          });
        }
      });
    } else if (this.sql.includes('delete')) {
      const whereCols = this.getWhereColumns();
      table.rows = table.rows.filter((row) => !this.matchesAllWhere(row, whereCols, args, 0));
    }
  }

  get(...args: unknown[]): TableRow | undefined {
    const tableName = this.getTableName();
    const table = this.tables.get(tableName);
    if (!table) return undefined;

    if (this.sql.includes('where')) {
      const whereCols = this.getWhereColumns();
      return table.rows.find((row) => this.matchesAllWhere(row, whereCols, args, 0));
    }
    
    return table.rows[0];
  }

  all(...args: unknown[]): TableRow[] {
    const tableName = this.getTableName();
    const table = this.tables.get(tableName);
    if (!table) return [];

    let rows = table.rows;
    
    if (this.sql.includes('where')) {
      const whereCols = this.getWhereColumns();
      rows = rows.filter((row) => this.matchesAllWhere(row, whereCols, args, 0));
    }

    const limitMatch = this.sql.match(/limit (\d+)/);
    if (limitMatch) {
      rows = rows.slice(0, parseInt(limitMatch[1], 10));
    }

    return rows;
  }

  private getTableName(): string {
    const match = this.sql.match(/(?:from|into|update)\s+(\w+)/);
    return match ? match[1] : '';
  }

  private getInsertColumns(): string[] {
    const match = this.sql.match(/insert into \w+ \(([^)]+)\)/);
    if (match) {
      return match[1].split(',').map((s) => s.trim());
    }
    return [];
  }

  private getUpdateColumns(): string[] {
    const match = this.sql.match(/set\s+([^where]+)/);
    if (match) {
      return match[1].split(',').map((s) => s.trim().split('=')[0].trim());
    }
    return [];
  }

  private getWhereColumns(): string[] {
    const whereMatch = this.sql.match(/where\s+(.+?)(?:\s+order|\s+limit|$)/);
    if (!whereMatch) return [];
    
    const whereClause = whereMatch[1];
    return whereClause.split(/\s+and\s+/i).map((cond) => {
      const colMatch = cond.trim().match(/(\w+)\s*=/);
      return colMatch ? colMatch[1] : '';
    }).filter((c) => c);
  }

  private matchesAllWhere(row: TableRow, whereCols: string[], args: unknown[], argsStart: number): boolean {
    return whereCols.every((col, i) => row[col] === args[argsStart + i]);
  }
}