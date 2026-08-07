# RIVAL PRAXIS REDUNIQ payment service

## Integration modes

- `hosted-link`: the merchant's fixed REDUNIQ Pay-by-Link page is available, but REDUNIQ has not supplied the API capability required to bind a server-calculated order amount to a payment token and verify the final transaction automatically. Automated checkout endpoints fail closed in this mode.
- `api-gateway`: when separately enabled for this merchant, the Worker creates a unique order, calculates the authoritative amount, calls REDUNIQ `initPayment`, redirects to the returned secure URL, verifies with `getResult` and, when enabled, the notification callback, then records the transaction and marks the order `paid` only after exact server-side verification.

Set `REDUNIQ_INTEGRATION_MODE` to `api-gateway` only after REDUNIQ confirms the merchant's E-Commerce Gateway access and supplies the Payment Solution code. Provider-specific code lives in `reduniq-provider.js` behind `payment-provider.js`; the Worker routes never build REDUNIQ payloads or interpret REDUNIQ result codes.

## Modular architecture and feature flags

- `worker.js` handles routing, CORS and error translation only.
- `payment-routes.js` is the website-facing payment boundary.
- `payment-service.js` owns sessions and the verification workflow.
- `payment-provider.js` is the provider registry; `reduniq-provider.js` is the REDUNIQ adapter.
- `payment-config.js` exposes only capabilities explicitly enabled in configuration.
- `commerce-service.js` owns checkout/order creation; `order-payment-service.js` is the narrow boundary used to mark an order pending or paid.
- `payment-record-service.js` owns attempt logs, transaction records and downloadable confirmations.

The fixed Pay-by-Link remains configured through `REDUNIQ_HOSTED_LINK`. API payments, webhooks, card routing, MB WAY and installments each have a separate flag and default to `false`. A flag must be enabled only after REDUNIQ confirms the capability for this merchant. API activation also requires `REDUNIQ_INTEGRATION_MODE=api-gateway`, `REDUNIQ_API_PAYMENTS_ENABLED=true`, a supplied `REDUNIQ_PAYMENT_SOLUTION`, and encrypted credentials. No solution code or payment method is inferred by the application.

The automated payment path intentionally excludes invoicing, delivery, shipping, and fulfilment state changes.

## Payment attempt lifecycle

Every REDUNIQ token creates one `payment_attempts` record using only its SHA-256 hash. Verification updates that record to `paid`, `failed`, `canceled`, or `unconfirmed` and appends an audit event. A verified exact-amount success marks the order `paid`, stores a professional HTML confirmation in `payment_transactions`, makes it downloadable on the status page, and attaches the same confirmation to the idempotent customer email. Failed and canceled attempts can create a fresh REDUNIQ session for the same order; unconfirmed attempts are rechecked before another payment is opened.

This worker keeps REDUNIQ credentials out of the public website and allows customers to pay only approved wholesale quotations. The public GitHub Pages site must never contain the API username or password.

## Required external setup

1. Obtain REDUNIQ sandbox credentials, the enabled payment-solution code, and written confirmation of each optional capability from REDUNIQ.
2. Create a Cloudflare Worker and a D1 database bound as `INVOICES_DB`.
3. Apply the tracked D1 migrations and add encrypted Worker secrets named `REDUNIQ_API_USERNAME` and `REDUNIQ_API_PASSWORD`.
4. Confirm the D1 binding in `wrangler.jsonc`, deploy with both activation switches off, and connect `payments.rivalpraxis.com` to the Worker.
5. Ask REDUNIQ to validate the sandbox flow. Only after acceptance, change `REDUNIQ_ENVIRONMENT` to `production` and add production credentials as secrets.

`wrangler.jsonc` defaults to the current REDUNIQ REST API v7.0 and attaches the Worker to `payments.rivalpraxis.com` as a Cloudflare Custom Domain. If REDUNIQ explicitly assigns API v6.0 to this merchant, change only `REDUNIQ_API_VERSION` to `6.0`. The Worker uses `transaction.status` as REDUNIQ's authoritative result and also requires the exact approved server-side amount.

The manual GitHub workflow `.github/workflows/deploy-payment-worker.yml` applies ordered D1 migrations and deploys the Worker after the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are installed. It deliberately keeps commerce and payments disabled, allowing hardened code to be deployed before merchant credentials arrive.

The public payment switch in `payment-config.js` must remain `enabled: false` until the Worker hostname resolves, TLS is valid, sandbox testing is accepted and production credentials are installed. If the acquiring agreement names Getnet rather than REDUNIQ, obtain the exact Getnet product and API specification before deployment; Getnet credentials are not interchangeable with REDUNIQ credentials.

## Manual invoicing

The Worker does not create or store fiscal invoices. Confirmed payments create durable transaction evidence, payment-confirmation emails and a printable customer payment confirmation marked as not being a tax invoice. The accountant issues the official invoice separately in AT-certified software. Follow `../INVOICING.md`.

## Complete commerce workflow

The schema migrations and `commerce-service.js` add persistent quote requests, private customer acceptance links, order creation and status history. `/admin.html` is the protected staff Commerce Desk. Its API requires the encrypted `ADMIN_API_TOKEN`; the token is never placed in website source.

Transactional messages use Resend when `EMAIL_PROVIDER=resend` and the encrypted `RESEND_API_KEY` is installed. The system emails request acknowledgements, new-request alerts, confirmed quotations, acceptance/payment confirmations, manual-invoice reminders and fulfilment updates. Idempotency records prevent successful messages from being sent twice.

## Approved quotation record

Approved quotations are created through the protected admin API and stored in D1. Do not create payment records manually or place customer data in KV. A stored quotation snapshot has this logical shape:

```json
{
  "status": "approved",
  "paymentStatus": "unpaid",
  "company": "Customer Company LDA",
  "email": "billing@example.com",
  "firstName": "Buyer",
  "lastName": "Name",
  "phone": "+351910000000",
  "tin": "500000000",
  "subtotal": 100000,
  "tax": 23000,
  "shipping": 1500,
  "total": 124500,
  "currency": "EUR",
  "expiresAt": "2026-09-01T23:59:59Z",
  "items": [
    { "sku": "RP-AC-0003", "name": "Approved wholesale order", "amount": 100000, "tax": 23000, "taxRate": 23, "quantity": 1 }
  ],
  "billing": {
    "street1": "Customer address",
    "street2": "",
    "city": "Lisboa",
    "state": "Lisboa",
    "zipCode": "1000-000",
    "country": "pt"
  },
  "shippingAddress": {
    "name": "Customer Company LDA",
    "street1": "Delivery address",
    "street2": "",
    "city": "Lisboa",
    "state": "Lisboa",
    "zipCode": "1000-000",
    "country": "pt"
  }
}
```

All money values are integer cents. The total must equal subtotal plus tax plus shipping. Never accept a total supplied by the browser.

## Security rules

- Keep credentials only as encrypted Worker secrets.
- Test with REDUNIQ sandbox before enabling production.
- Verify every return and notification using `getResult`.
- Never mark an order paid from a browser redirect alone.
- Retain transaction and invoice records according to accounting and legal requirements.
- Reconcile every captured transaction against the provider back office before fulfilment.
- Never commit `.dev.vars`, API credentials, merchant secrets or live quotation records.
