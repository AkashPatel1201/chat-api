declare module 'pg' {
  export class Pool {
    constructor(config?: Record<string, any>);
    connect(): Promise<any>;
    query(text: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
  }
  const pg: { Pool: typeof Pool };
  export default pg;
}
