import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Node 24 can close the spawned TypeScript CLI before its captured stdout is
    // consumed. The compiler API performs the same build-time check in-process.
    useTypeScriptCli: false,
  },
  async rewrites() {
    const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;

