import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';

type TrackedRequest = Request & { user?: AuthenticatedUser };

export const LOGIN_IP_THROTTLER = 'login-ip';

export function clientIp(request: Request): string {
  return request.ips[0] ?? request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

export function isLoginRequest(context: ExecutionContext): boolean {
  return context.switchToHttp().getRequest<Request>().path.endsWith('/auth/login');
}

@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: TrackedRequest): Promise<string> {
    const ip = clientIp(request);
    if (request.path.endsWith('/auth/login')) {
      const rawEmail = (request.body as { email?: unknown } | undefined)?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : 'invalid-email';
      return Promise.resolve(`login:${ip}:${email}`);
    }
    return Promise.resolve(request.user ? `user:${request.user.id}` : `ip:${ip}`);
  }
}
