# RIVAL PRAXIS REDUNIQ payment service

This worker keeps REDUNIQ credentials out of the public website and allows customers to pay only approved wholesale quotations. The public GitHub Pages site must never contain the API username or password.

## Required external setup

1. Obtain REDUNIQ sandbox credentials and the enabled payment-solution code from REDUNIQ.
2. Create a Cloudflare Worker, a KV namespace bound as `QUOTES`, a D1 database bound as `INVOICES_DB`, and a private R2 bucket bound as `INVOICE_PDFS`.
3. Apply `invoice-schema.sql` to D1 and add encrypted Worker secrets named `REDUNIQ_API_USERNAME` and `REDUNIQ_API_PASSWORD`.
4. Replace the KV and D1 IDs in `wrangler.jsonc`, deploy in sandbox mode, and connect `payments.rivalpraxis.com` to the Worker.
5. Ask REDUNIQ to validate the sandbox flow. Only after acceptance, change `REDUNIQ_ENVIRONMENT` to `production` and add production credentials as secrets.

`wrangler.jsonc` defaults to the current REDUNIQ REST API v7.0 and attaches the Worker to `payments.rivalpraxis.com` as a Cloudflare Custom Domain. If REDUNIQ explicitly assigns API v6.0 to this merchant, change only `REDUNIQ_API_VERSION` to `6.0`. The Worker uses `transaction.status` as REDUNIQ's authoritative result and also requires the exact approved server-side amount.

The manual GitHub workflow `.github/workflows/deploy-payment-worker.yml` deploys the Worker only after the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are installed. It deliberately refuses to deploy while KV IDs or the payment-solution code are placeholders.

The public payment switch in `payment-config.js` must remain `enabled: false` until the Worker hostname resolves, TLS is valid, sandbox testing is accepted and production credentials are installed. If the acquiring agreement names Getnet rather than REDUNIQ, obtain the exact Getnet product and API specification before deployment; Getnet credentials are not interchangeable with REDUNIQ credentials.

## Invoices

Confirmed payments are connected to the invoicing service, but fiscal issuance defaults to disabled. Read `../INVOICING.md` before activation. Production requires an AT-certified invoicing provider, its encrypted API key, an approved fiscal series, ATCUD/QR support, private PDF storage and accountant sign-off. The Worker never treats its internal request number as the official fiscal invoice number.

## Approved quotation record

Before sending a payment link, staff must create one KV record. The key is `quote:RP-2026-00124`. The value is JSON like this:

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
