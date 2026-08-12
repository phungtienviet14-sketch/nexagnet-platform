import { Injectable } from '@nestjs/common';
import { hash, verify, argon2id } from 'argon2';

export abstract class PasswordService {
  abstract hash(password: string): Promise<string>;
  abstract verify(passwordHash: string, password: string): Promise<boolean>;
}

@Injectable()
export class Argon2PasswordService extends PasswordService {
  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
