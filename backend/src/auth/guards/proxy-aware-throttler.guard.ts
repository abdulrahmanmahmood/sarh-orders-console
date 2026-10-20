import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';

type TrackedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: TrackedRequest): Promise<string> {
    const clientIp = request.ips[0] ?? request.ip ?? request.socket.remoteAddress ?? 'unknown';
    if (request.path.endsWith('/auth/login')) {
      const rawEmail = (request.body as { email?: unknown } | undefined)?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : 'invalid-email';
      return Promise.resolve(`login:${clientIp}:${email}`);
    }
    return Promise.resolve(request.user ? `user:${request.user.id}` : `ip:${clientIp}`);
  }
}
