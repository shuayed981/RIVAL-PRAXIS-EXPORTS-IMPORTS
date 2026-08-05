# Manual invoicing procedure

RIVAL PRAXIS does not generate fiscal invoices through the website. The automatic invoice connector, PDF storage and invoice-download endpoint have been removed.

After REDUNIQ confirms a payment and the exact server-side amount matches the approved quotation:

1. D1 records the paid order, quotation reference, transaction ID, amount, currency and audit event.
2. The customer and merchant receive payment-confirmation emails.
3. The customer can print a payment confirmation clearly marked **not a tax invoice**.
4. The merchant sends the paid-order information to the accountant.
5. The accountant issues the official invoice using AT-certified invoicing software and sends it to the customer's billing email.

The accountant should receive the customer/company name, tax number, billing and delivery address, product lines, subtotal, VAT, shipping, total, currency, payment date, quotation/order reference and gateway transaction ID.

The accountant remains responsible for the fiscal series, VAT treatment, ATCUD, QR code, SAF-T/e-Fatura communication, corrections and credit notes. A website payment confirmation must never be represented as an official tax invoice.

Portuguese Tax Authority references:

- https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_de_faturacao/Paginas/default.aspx
- https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Faturacao/Regras_mecanismos_comunicacao/Paginas/default.aspx
