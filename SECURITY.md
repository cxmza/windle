# Security policy

## Reporting a vulnerability

**Please do not report security issues in public issues, discussions or pull requests.**

Use GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/cxmza/windle/security/advisories/new)**
(Security tab → *Report a vulnerability*). Only the maintainers can see the report.

Helpful to include:

- the affected surface (`www`, `app`, `oauth`, `docs`, `api`, `cdn`) or file/path in this repository;
- steps to reproduce, a proof of concept, and the impact you expect;
- any request ids (`X-Request-Id` response header) from your testing.

We aim to acknowledge reports within **3 business days** and to send a status update at least weekly until the issue
is resolved. Once a fix is deployed we will publish an advisory and, if you wish, credit you.

## Scope

In scope: this repository and the live services at `*.windle.fun` — sign-in (Sign-In With Solana), sessions, the
account API, CORS/CSRF handling, the static sites and their headers, and the CDN.

Out of scope:

- the protocol programs, which are not deployed yet (design feedback is welcome in Discussions);
- volumetric denial of service, spam, or social engineering;
- findings that need a compromised device, wallet or browser extension;
- missing best-practice headers without a demonstrable impact;
- third-party services (Cloudflare, wallets, GitHub) — report those to their vendors.

## Testing rules

- Use your own wallet and accounts; never access or modify data that isn't yours.
- Keep automated scanning gentle: the API rate-limits per client IP and answers `429` with `Retry-After`.
- Stop and report as soon as you can demonstrate the issue.

windle is pre-launch and holds no user funds. There is no paid bug bounty at this time.
