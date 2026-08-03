# RIVAL PRAXIS invoicing system

## What is implemented

After REDUNIQ confirms a payment and the exact server-side amount matches the approved quotation, the Worker creates one idempotent invoice request. D1 allocates an atomic internal audit number, stores immutable seller, buyer, line-item and payment snapshots, and keeps an append-only event trail. The certified invoicing provider returns the official invoice number, issue date, ATCUD, QR payload and final PDF. The PDF is stored privately in R2 and can only be downloaded using the payment-session token.

The internal `RP-PAY/YYYY-000001` number is a processing reference, not the Portuguese fiscal document number. The official sequential fiscal number must be allocated by the certified invoicing system.

## Production activation

1. Choose software or an API provider certified by the Portuguese Tax Authority (AT).
2. Have the accountant approve the invoice series, VAT treatment, exemption wording, intra-EU reverse-charge handling and export rules.
3. Communicate the fiscal series to AT and configure its validation code so the provider can issue the ATCUD.
4. Confirm that the provider generates the AT-compliant QR code, supports SAF-T/e-Fatura communication, preserves issued documents and handles credit notes.
5. Create the Cloudflare D1 database and R2 bucket, then apply `reduniq-worker/invoice-schema.sql`.
6. Configure the certified API endpoint and store `CERTIFIED_INVOICE_API_KEY` as a Worker secret. Never commit it.
7. Test duplicate notifications, failed callbacks, refunds and credit notes in sandbox.
8. Only after acceptance, set `INVOICE_PROVIDER=certified-api` and `INVOICE_ISSUANCE_ENABLED=true`.

Until all steps are complete, issuance stays disabled. A homemade PDF must not be represented as an AT-compliant tax invoice.

## Security and accounting controls

- Payment status and amount are verified directly with REDUNIQ before invoicing.
- A unique transaction ID and provider idempotency key prevent duplicate invoices.
- The payment token is stored only as a SHA-256 hash in the invoice database.
- PDFs stay in a private R2 bucket and are returned with `no-store` caching.
- Issued invoice snapshots are not edited; corrections belong in the certified provider as credit notes.
- Restrict D1/R2 access to the Worker, use least-privilege credentials, enable provider audit logs, and define a legally reviewed retention policy.

## Provider contract

The adapter sends a JSON request containing the request reference, document type, quote and transaction references, seller, buyer, items and cent-denominated totals. The certified provider must return:

- `invoiceNumber`
- `issueDate`
- `atcud`
- `qrCodeText`
- `providerDocumentId`
- `pdfBase64`

Adapt `certifiedProvider()` in `reduniq-worker/invoice-service.js` to the selected provider's authenticated API without weakening the required-field checks.

## Portuguese compliance references

- AT invoicing rules: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_de_faturacao/Paginas/default.aspx
- AT communication mechanisms: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Paginas/default.aspx
- AT invoicing legislation, including Portaria 195/2020: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_de_faturacao/Legislacao/Paginas/default.aspx

This technical design is not legal or tax advice. Final activation requires review by the company's Portuguese accountant and the chosen AT-certified software provider.
