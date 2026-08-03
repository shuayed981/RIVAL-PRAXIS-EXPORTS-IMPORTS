# Hosted payment activation

The storefront and approved-quotation payment portal are provider-neutral. They do not collect or store card details. `payment-config.js` must remain disabled until a merchant provider has approved its sandbox and production flow.

## REDUNIQ

The Worker in `reduniq-worker/` already implements server-side quotation lookup, exact-total verification, hosted REDUNIQ redirect, result verification, notification handling, rate limiting and audit records.

Activation requires the merchant's API username, API password, payment-solution code, confirmed API version, Cloudflare KV namespaces, sandbox acceptance and a controlled production test. Follow `reduniq-worker/DEPLOYMENT.md`.

## Getnet

The public payment portal lists Getnet as a supported future provider and can use the same approved-quotation workflow. The Getnet server adapter must be connected to the exact product and integration profile assigned in the Portuguese merchant contract (for example Get Checkout redirect, iframe or server-to-server). Endpoint paths, authentication, signatures, notification verification and status values must come from that onboarding package; they must not be guessed.

When those details arrive:

1. Record the assigned Getnet product, country profile, sandbox base URL and production base URL.
2. Store all private credentials as encrypted server secrets, never in website JavaScript.
3. Map the existing server-side quotation total and order reference into the assigned hosted-checkout request.
4. Set success, error and signed-notification URLs to the payment Worker.
5. Verify the provider response and exact amount on the server before marking an order paid.
6. Test success, decline, cancellation, duplicate submission, expired quotation, altered amount and notification-only completion.
7. Enable only the approved provider in `payment-config.js` after reconciliation succeeds.

Do not activate REDUNIQ and Getnet simultaneously unless the commercial rules for provider selection and reconciliation have been agreed.
