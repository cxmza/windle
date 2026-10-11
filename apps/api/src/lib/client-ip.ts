import { BlockList, isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

/** Trusted proxy hops as a BlockList (IPs and CIDRs, v4 and v6). */
export function createTrustList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const raw of entries) {
    const [address, prefix] = raw.split('/');
    const family = address ? isIP(address) : 0;
    if (!address || family === 0) throw new Error(`TRUST_PROXY: "${raw}" is not an IP or CIDR`);
    const type = family === 6 ? 'ipv6' : 'ipv4';
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return list;
}

function normalize(ip: string): string {
  // IPv4-mapped IPv6 (::ffff:127.0.0.1), as Node reports v4 peers on a dual-stack socket.
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

export function isTrusted(list: BlockList, ip: string | undefined): boolean {
  if (!ip) return false;
  const addr = normalize(ip);
  const family = isIP(addr);
  if (family === 0) return false;
  return list.check(addr, family === 6 ? 'ipv6' : 'ipv4');
}

function headerIp(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  return first && isIP(first) ? first : undefined;
}

/**
 * The visitor's IP. Proxy headers count only when the TCP peer is a trusted hop (host nginx, or the docker bridge
 * gateway in front of the container). Order:
 *  1. X-Real-IP: nginx sets it to $remote_addr AFTER cloudflare-realip, so it is the CF-Connecting-IP value for
 *     requests that really came through Cloudflare, and the true peer for anything that did not (unspoofable).
 *  2. CF-Connecting-IP: when the proxy forwards Cloudflare's header without X-Real-IP.
 *  3. The socket peer.
 */
export function clientIp(request: FastifyRequest, trust: BlockList): string {
  const peer = normalize(request.socket.remoteAddress ?? '');
  if (isTrusted(trust, peer)) {
    const forwarded = headerIp(request, 'x-real-ip') ?? headerIp(request, 'cf-connecting-ip');
    if (forwarded) return normalize(forwarded);
  }
  return peer || '0.0.0.0';
}

/** True when the request arrived directly (not relayed by the edge proxy) from loopback or a trusted hop. */
export function isInternalRequest(request: FastifyRequest, trust: BlockList): boolean {
  const relayed = ['x-real-ip', 'x-forwarded-for', 'cf-connecting-ip', 'cf-ray'].some((h) => h in request.headers);
  if (relayed) return false;
  const peer = normalize(request.socket.remoteAddress ?? '');
  return peer === '127.0.0.1' || peer === '::1' || isTrusted(trust, peer);
}
