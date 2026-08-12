import type { Request } from 'express';
import type { AuthenticatedUser, SessionIdentity } from './auth.types.js';

declare module 'express-session' {
  interface SessionData {
    user?: SessionIdentity;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}
