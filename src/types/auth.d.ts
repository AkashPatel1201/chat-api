declare module 'passport-jwt' {
  import { Strategy as PassportStrategy } from 'passport';

  export interface StrategyOptions {
    jwtFromRequest: (req: any) => string | null;
    secretOrKey?: string | Buffer;
    secretOrKeyProvider?: any;
    issuer?: string;
    audience?: string;
    algorithms?: string[];
    ignoreExpiration?: boolean;
    passReqToCallback?: boolean;
    jsonWebTokenOptions?: any;
  }

  export interface VerifiedCallback {
    (error: any, user?: any, info?: any): void;
  }

  export class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (payload: any, done: VerifiedCallback) => void,
    );
  }

  export namespace ExtractJwt {
    export function fromAuthHeaderAsBearerToken(): (req: any) => string | null;
    export function fromHeader(header_name: string): (req: any) => string | null;
    export function fromUrlQueryParameter(param_name: string): (req: any) => string | null;
  }
}

declare module 'bcryptjs' {
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function genSalt(rounds?: number): Promise<string>;
  export function hashSync(s: string, salt?: number | string): string;
  export function compareSync(s: string, hash: string): boolean;
}
