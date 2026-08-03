# Payment Worker deployment

## DNS prerequisite

`rivalpraxis.com` must be an active Cloudflare zone before the Worker Custom Domain can be created. Import and preserve these GitHub Pages records before changing the registrar nameservers:

- `A @ 185.199.108.153` (DNS only)
- `A @ 185.199.109.153` (DNS only)
- `A @ 185.199.110.153` (DNS only)
- `A @ 185.199.111.153` (DNS only)
- `CNAME www shuayed981.github.io` (DNS only)

Change the registrar nameservers only after Cloudflare displays these records. The `payments` record must not be created manually. `wrangler deploy` creates `payments.rivalpraxis.com` as a Worker Custom Domain and Cloudflare provisions its TLS certificate.

## One-time Cloudflare setup

1. Create the production and preview KV namespaces named `QUOTES` and `QUOTES_PREVIEW`.
2. Create D1 database `rival-praxis-invoices`, apply `invoice-schema.sql`, and place its ID in `wrangler.jsonc`.
   Apply `commerce-schema.sql` to the same D1 database for quote requests, approved quotations, orders, status events and email delivery records.
3. Create a private R2 bucket named `rival-praxis-invoices`.
4. Put the KV IDs in `wrangler.jsonc` and set `REDUNIQ_PAYMENT_SOLUTION` to the code supplied by REDUNIQ.
5. Confirm `REDUNIQ_API_VERSION` with REDUNIQ; use `7.0` unless they explicitly assign `6.0`.
6. Install encrypted Worker secrets named `REDUNIQ_API_USERNAME` and `REDUNIQ_API_PASSWORD`.
7. Generate a random administrator token of at least 32 characters and install it as the encrypted Worker secret `ADMIN_API_TOKEN`.
8. Verify `orders@rivalpraxis.com` with the transactional email provider, set `EMAIL_PROVIDER=resend`, and install `RESEND_API_KEY` as an encrypted Worker secret.
9. Add GitHub repository secrets named `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Scope the API token to the required account and `rivalpraxis.com` zone only.

## Deploy

In GitHub, open Actions, select **Deploy payment Worker**, choose **Run workflow**, and run it on `main`. The workflow refuses to deploy placeholder KV IDs or an empty payment-solution code.

After it succeeds, verify:

- `payments.rivalpraxis.com` resolves in public DNS.
- `https://payments.rivalpraxis.com/` returns `405 Method Not Allowed` for GET.
- An OPTIONS request from `https://rivalpraxis.com` receives status 204 and the expected CORS headers.
- Sandbox success, decline, cancellation, duplicate attempt, browser return, notification-only completion and exact-amount checks all pass.
- A quote request is stored, both confirmation emails arrive, a merchant can create a quote in `/admin.html`, the private acceptance link works, and acceptance creates an order.
- Payment moves the order through `payment_pending` and `paid`; merchant updates for processing, shipping and delivery notify the customer.
- The certified invoice PDF is attached to the customer and merchant emails exactly once.

Keep the public switch in `payment-config.js` disabled until REDUNIQ accepts the sandbox flow. Production activation requires production credentials, `REDUNIQ_ENVIRONMENT` set to `production`, a controlled live transaction and provider-back-office reconciliation.

Invoice issuance is a separate activation gate. Keep `INVOICE_ISSUANCE_ENABLED=false` until an AT-certified provider has been integrated and accepted. Then store `CERTIFIED_INVOICE_API_KEY` as a Worker secret, configure the provider URL, complete the checklist in `../INVOICING.md`, and only then enable issuance.

Finally, change `commerceEnabled` in `payment-config.js` to `true` after the commerce endpoints and email delivery are verified. Change the separate `enabled` payment switch only after REDUNIQ accepts the hosted-payment flow.
