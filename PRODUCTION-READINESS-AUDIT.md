# RIVAL PRAXIS Production-Readiness Audit

Audit date: 3 August 2026
Audited target: canonical website source, Cloudflare payment Worker source, D1 schemas, R2/KV/D1 bindings, GitHub workflows, and the currently deployed storefront/payment API.

## Executive verdict

### Remediation update — 5 August 2026

Manual-invoicing decision: the automatic fiscal-invoice connector, invoice PDF storage, invoice API endpoint and customer invoice-download controls were removed at the merchant's request. Payment evidence remains: D1 transaction/order records, append-only audit events, customer and merchant confirmation emails, and a printable payment confirmation explicitly marked as not being a tax invoice. Official invoices are issued separately by the accountant using AT-certified software.

All code-controlled critical findings identified below have now been remediated in the canonical source: payment state, rate limits, and audit history are D1-centred; shipping is persisted and mapped into hosted checkout; payment and commerce have independent fail-closed switches; invoice/PDF validation, seven-day access expiry, issuance retries, and attachment-email retries are implemented; admin browser sessions expire after 15 minutes; registered-address display is consistent; and the Pages deployment uses a strict public-file allowlist. The manual Worker deployment now applies tracked migrations while leaving both activation switches off. Automated production-readiness tests, JavaScript syntax checks, and fresh-schema validation pass.

The remaining **NO-GO for real payments** is external or credential-dependent: REDUNIQ merchant parameters and sandbox approval, an AT-certified invoice provider and accountant approval, transactional-email credentials/domain verification, Cloudflare account security controls, and recorded sandbox/live reconciliation. Older finding text below is retained as the original audit baseline; items describing KV payment state, non-atomic application rate limiting, missing ordered migrations, missing PDF size limits, or absent retry processing are superseded by this update.

**Production-readiness score: 46/100.**

The public catalogue is suitable for browsing and quote collection after the fixes in this audit are reviewed and deployed. The application is **not ready to accept real customer payments or large-value transactions**. The live payment Worker has no configured secrets, payment/email/invoice switches are disabled, the Reduniq payment solution is blank, Getnet is not implemented, and the certified Portuguese invoice connector is only an adapter awaiting a real certified provider.

No real payment end-to-end test could be completed without sandbox credentials and a test merchant account. No production funds should be enabled until the manual launch gates below pass.

## Scope and verification performed

- Reviewed all top-level HTML, CSS, and JavaScript files.
- Reviewed the Worker router, commerce service, Reduniq client, email service, invoice service, configuration, D1 schemas, and deployment workflows.
- Checked all 17 HTML pages for local links/assets, duplicate IDs, and image alternative text.
- Checked all 12 JavaScript files for syntax errors.
- Checked every CSS file for balanced structure.
- Parsed the Worker JSONC configuration.
- Checked canonical source files for exact duplicates.
- Inspected the live Worker settings, custom domain, bindings, secrets, runtime variables, D1 schema/foreign-key state, row counts, and private R2 bucket.
- Exercised live negative API paths for method, origin, authorization, malformed input, callback token, and unknown routes.
- Checked live response security headers and representative asset weights.

Measured browser Core Web Vitals and automated multi-device visual regression were not available in this environment. Desktop, tablet, mobile, keyboard, screen-reader, and real-device payment checks remain launch gates.

## Critical issues

1. **Real payments are disabled and unconfigured.** The live Worker has no secrets. Reduniq is set to sandbox, the payment solution is blank, and `PAYMENTS_ENABLED` is false.
2. **Getnet is not integrated.** The current backend routes implement Reduniq only; a configuration label is not a Getnet implementation.
3. **Automatic invoicing is not operational.** Invoice issuance is disabled and the certified-provider URL/key are absent. The existing connector expects an external certified Portuguese invoicing service; it is not itself certified software.
4. **Transactional email is not operational.** Email delivery is disabled/unconfigured, so customers and the merchant cannot receive quote, payment, invoice, or status emails.
5. **No successful sandbox end-to-end transaction has been proven.** Quote request, approval, hosted payment, return/callback verification, paid order, invoice, R2 storage, and both emails require a recorded sandbox test before launch.
6. **The deployed version does not contain the audit fixes.** Changes in this report are local and intentionally not published during an audit without final review.

## High and medium issues

- Payment state is divided between KV and D1, so multi-step updates are not atomic. A Durable Object or D1-centred state machine is recommended for high-value orders.
- The KV rate limiter is not atomic and can be exceeded under concurrent requests. Add Cloudflare Rate Limiting and Turnstile/bot controls.
- Quote/payment bearer tokens are placed in URLs. They can appear in browser history and operational logs; use short expiries, redact logs, and preferably exchange one-time URL tokens for secure session cookies.
- Admin access uses a single bearer token stored in browser session storage. Replace with Cloudflare Access or named administrator accounts with MFA, roles, session expiry, and an audit log.
- Product prices supplied in quote requests originate in the browser. Admin approval provides a control, but the backend should own a versioned product/price catalogue and re-price every request.
- Refund processing is not implemented. The former UI/backend ability to label an order refunded without contacting a gateway was removed.
- Invoice rows use a textual quote reference rather than an enforced order/quote foreign key. Add immutable invoice-to-order linkage in a controlled migration.
- Raw SQL schema files are idempotent but there is no ordered migration/version/rollback system.
- R2 is in Western Europe but has default jurisdiction rather than an explicit EU jurisdiction policy. Confirm contractual/data-residency requirements.
- Storefront responses lack a site-wide CSP, HSTS, `nosniff`, clickjacking, and referrer headers. The Worker API now sends these locally, but Cloudflare response-header rules or Pages `_headers` are still required for static pages.
- Payment/invoice provider responses need formal schema validation and maximum PDF-size enforcement before decoding/storing.
- Accessibility still needs manual keyboard, focus, zoom/reflow, contrast, and screen-reader testing.
- Browser compatibility and responsive appearance require real desktop/tablet/mobile testing after deployment.

## Low-priority and maintenance issues

- The workspace contains stale publishing/output copies (`.publish-checkout`, `github-upload-final`, and `output`). They are now ignored locally but should be archived or clearly documented to prevent publishing the wrong copy.
- A generated Python bytecode cache and sample invoice script are not runtime dependencies and should be removed or moved to documented tooling.
- Source PNG originals for newly generated products are large. They were preserved as editable source assets but must not be accidentally published when unused.
- The static Pages workflow and manual Worker workflow are separate, so a website deployment can expose UI for an incompatible Worker release. Add versioned release coordination and smoke tests.
- Observability was disabled live. Local Worker configuration now enables logs and sampled traces, but retention, redaction, alerts, and cost limits must be configured.

## Safe fixes applied locally

- Bounded JSON request bodies to 256 KiB, including streamed/chunked bodies.
- Added correct 400/404/409/413/415 responses instead of turning validation failures into generic 500 errors.
- Repaired browser admin CORS preflight by allowing the `Authorization` header.
- Added API CSP, HSTS, no-sniff, anti-framing, and no-referrer headers.
- Replaced direct admin-token string comparison with digest-based constant-time comparison.
- Added timeouts to Reduniq, certified-invoice, and email provider requests.
- Strengthened email, cents, item, quantity, tax, expiry, and quote-state validation.
- Recalculated quote line totals on the server.
- Reduced quote-acceptance race risk with a conditional database update.
- Restricted order transitions to `paid -> processing -> shipped -> delivered`.
- Removed misleading cancelled/refunded admin options; refunds now require a future real gateway operation.
- Hardened cart parsing and replaced local-storage-controlled `innerHTML` rendering with safe DOM text rendering.
- Added missing search/admin accessibility labels and safer external policy links.
- Added no-referrer handling to admin and payment-status pages.
- Enabled Worker observability and Node compatibility locally.
- Removed the duplicate sample Jekyll Pages workflow.
- Ignored stale publishing/output folders and Python cache files.
- Converted four prominent homepage images from about 7.7 MB of PNG data to about 364 KB of WebP data (approximately 95% smaller), added intrinsic dimensions and lazy decoding for collection images, and preserved original sources.

## Database assessment

The live D1 database contains the expected eight application tables and indexes. Foreign-key checking returned no violations, and all application tables currently contain zero rows. Existing relationships cover quote requests, commerce quotes, orders, invoices, invoice events, email events, and sequences, but invoice-to-order linkage should be enforced. Backups, point-in-time recovery procedure, retention, restore testing, migration discipline, and concurrency/idempotency load tests are not yet demonstrated.

## Payment-flow assessment

The intended Reduniq path is present in code:

`quote request -> admin-confirmed quote -> customer acceptance -> order awaiting payment -> hosted payment initialization -> Reduniq return/callback -> server-side result and amount verification -> paid order -> certified invoice -> private R2 PDF -> customer and merchant email`

The path is structurally incomplete for production because all external integrations are disabled/uncredentialed and no real success/failure/cancel/duplicate-callback test evidence exists. Getnet, gateway refunds, reconciliation, chargeback handling, and operational retry queues are absent.

## Security assessment

**Current rating: high risk for payment launch; moderate for catalogue/quote-only use.**

Positive controls include strict origin checks, bearer protection for admin APIs, server-side gateway result verification, transaction/amount checks, private R2 storage, hashed payment tokens in invoice records, idempotency keys, HTML escaping in emails, and D1 parameter binding. The remaining launch risks are unproven identity/authorization operations, URL bearer tokens, non-atomic state/rate limiting, missing static response headers, no WAF/rate-limit evidence, no secret rotation procedure, and no independent penetration test.

## Performance assessment

The largest immediate homepage image cost was reduced locally by about 95%. Product images are generally optimized, but unused high-resolution sources remain in the workspace. Required next checks are Lighthouse/WebPageTest or Chrome traces on production, LCP/INP/CLS budgets, cache-header verification, slow-network testing, and Worker/D1 load tests. Set concrete budgets (for example LCP under 2.5 seconds at p75 and CLS under 0.1) and alert on regressions.

## Manual launch gates

1. Contract with Reduniq and/or Getnet; obtain sandbox and production credentials, payment solution/terminal identifiers, allowed callback/return URLs, and official API documentation.
2. Choose one gateway for the first launch. Implement Getnet separately if required; do not enable a provider by configuration label alone.
3. Select Portuguese tax-authority-certified invoicing software/provider, verify its certification/current status with the provider and accountant, map FT/FS/NC documents, VAT exemptions, ATCUD/QR requirements, SAF-T exports, cancellations, credit notes, and record retention.
4. Correct and legally verify seller name, NIF, registered address, contact details, tax series, and invoice text. The current default seller address must not be trusted without confirmation.
5. Configure Worker secrets through Cloudflare secret storage, never source control: admin auth, Reduniq/Getnet credentials, callback secrets, email key, and certified-invoice key.
6. Configure verified email sending domain, SPF, DKIM, DMARC, merchant recipients, bounces, complaints, and delivery monitoring.
7. Add Cloudflare Access/MFA for the admin desk, WAF/rate limiting/Turnstile, static security headers, log redaction, alerts, and secret rotation.
8. Introduce ordered D1 migrations, backups/restore test, explicit invoice/order foreign keys, a retry/outbox queue, and reconciliation jobs.
9. Run documented sandbox tests for success, decline, cancel, timeout, duplicate callback, forged callback, wrong amount/currency, expired quote, invoice-provider outage, email outage, and retry/reconciliation.
10. Have Portuguese accounting/legal counsel approve tax and consumer/B2B documents. Technical implementation alone does not establish legal compliance.
11. Run an independent security/penetration test and accessibility audit.
12. Deploy to staging first, run browser/device and load tests, review logs, then promote the exact tested commit to production with a rollback plan.

## Final recommendation

**Do not enable real payments yet.** Deploy the reviewed fixes to a staging environment, complete the credentialed Reduniq sandbox path and certified-invoice integration, and pass every manual launch gate. The catalogue and quote-request experience can remain public, but large-value transactions should wait for successful end-to-end evidence, accounting approval, security testing, monitoring, and a rehearsed rollback/reconciliation process.
