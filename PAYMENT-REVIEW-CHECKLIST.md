# Payment review readiness

Prepared for the REDUNIQ / Getnet merchant review on 3 August 2026.

## Public website evidence

- Merchant name: RIVAL PRAXIS UNIPESSOAL LDA
- NIF/NIPC: 519497074
- Published address: Rua Cidade de Bolama, 446 R/C, 1800-079 Lisboa, Portugal
- Published email: rivalpraxisunipessoallda@gmail.com
- Published telephone: +351 920 020 495
- Products, indicative pricing, quotation workflow and B2B status are visible on the public website.
- Terms, privacy, cookies, shipping, returns, payment policy, merchant information and complaints-book links are published.
- The payment page explains that card data is entered only on the activated provider's secure page.
- The website does not collect or store complete card credentials.

## Technical controls implemented

- Payment totals are loaded from an approved server-side quotation and cannot be supplied by the browser.
- Provider credentials are stored only as encrypted Worker secrets.
- The browser redirect never marks an order paid.
- Payment success requires a fresh provider `getResult` response, a finished-success transaction status, a recognized provider success code and an exact amount match.
- Quotation lookup, payment initialization and result verification are rate limited.
- Active payment sessions are reused to reduce duplicate-payment risk.
- Payment initialization and confirmation events are retained as audit records.
- CORS permits only the published website origin.
- Production and sandbox endpoints are selected on the server.

## Account-holder actions required before activation

These values cannot be created or guessed in website source code.

1. Confirm with the selected acquirer whether the approved integration is REDUNIQ Gateway v6.0, REDUNIQ Gateway v7.0, Getnet Web Checkout, or another product.
2. Obtain sandbox API username, API password and payment-solution code.
3. Apply the D1 schemas and tracked production-hardening migration; confirm the private R2 binding.
4. Store `REDUNIQ_API_USERNAME` and `REDUNIQ_API_PASSWORD` as encrypted Worker secrets.
5. Deploy the Worker and map `payments.rivalpraxis.com` to it.
6. Add the DNS record and confirm a valid TLS certificate for `payments.rivalpraxis.com`.
7. Create one approved sandbox quotation record and complete success, cancellation, failure and duplicate-attempt tests.
8. Give the provider the notification URL `https://payments.rivalpraxis.com/api/payment/notification` and the return URLs on `https://rivalpraxis.com/payment-status.html`.
9. Obtain written sandbox acceptance before changing the environment to production.
10. Install production credentials, run a low-value production transaction and reconcile it in the provider back office.
11. Only then change `payment-config.js` to `enabled: true` and remove the activation notice from `pay.html`.

## Evidence to have ready for the reviewer

- Company-registration and bank-account ownership documents.
- Signed acquiring agreement and merchant/solution identifiers.
- Screenshots or exports of successful and failed sandbox transactions.
- Proof that webhook and browser-return transactions are verified in the provider back office.
- Refund, fulfilment and customer-support procedures.
- The public URLs for every policy and the secure payment page.

Do not activate public payments merely to satisfy a review. Activation must follow successful provider sandbox acceptance and live credential installation.
