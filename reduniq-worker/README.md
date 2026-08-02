# RIVAL PRAXIS REDUNIQ payment service

This worker keeps REDUNIQ credentials out of the public website and allows customers to pay only approved wholesale quotations. The public GitHub Pages site must never contain the API username or password.

## Required external setup

1. Obtain REDUNIQ sandbox credentials and the enabled payment-solution code from REDUNIQ.
2. Create a Cloudflare Worker and a KV namespace bound as `QUOTES`.
3. Add encrypted Worker secrets named `REDUNIQ_API_USERNAME` and `REDUNIQ_API_PASSWORD`.
4. Replace the KV IDs in `wrangler.jsonc`, deploy in sandbox mode, and connect `payments.rivalpraxis.com` to the Worker.
5. Ask REDUNIQ to validate the sandbox flow. Only after acceptance, change `REDUNIQ_ENVIRONMENT` to `production` and add production credentials as secrets.

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
    { "name": "Approved wholesale order", "amount": 100000, "tax": 23000, "quantity": 1 }
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
