const enabled = value => String(value || "").toLowerCase() === "true";

function safeHostedLink(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "pagamentos.reduniq.pt" || !url.pathname.startsWith("/pay-by-link/")) return "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}
export function paymentCapabilities(env) {
  const provider = String(env.PAYMENT_PROVIDER || "reduniq").toLowerCase();
  const mode = String(env.REDUNIQ_INTEGRATION_MODE || "hosted-link").toLowerCase();
  const hostedLink = safeHostedLink(env.REDUNIQ_HOSTED_LINK);
  const apiPayments = enabled(env.REDUNIQ_API_PAYMENTS_ENABLED) && mode === "api-gateway";
  const solutionCodeConfigured = /^\d{3}$/.test(String(env.REDUNIQ_PAYMENT_SOLUTION || ""));

  return Object.freeze({
    provider,
    mode,
    hostedLink: Object.freeze({ enabled: Boolean(hostedLink), url: hostedLink || null }),
    apiPayments: Object.freeze({ enabled: apiPayments, solutionCodeConfigured }),
    webhooks: Object.freeze({ enabled: apiPayments && enabled(env.REDUNIQ_WEBHOOKS_ENABLED) }),
    cards: Object.freeze({ enabled: apiPayments && enabled(env.REDUNIQ_CARD_PAYMENTS_ENABLED) }),
    mbWay: Object.freeze({ enabled: apiPayments && enabled(env.REDUNIQ_MBWAY_ENABLED) }),
    installments: Object.freeze({ enabled: apiPayments && enabled(env.REDUNIQ_INSTALLMENTS_ENABLED) }),
  });
}

export function publicPaymentCapabilities(env) {
  const capabilities = paymentCapabilities(env);
  return {
    provider: capabilities.provider,
    mode: capabilities.mode,
    hostedLink: capabilities.hostedLink,
    apiPayments: { enabled: capabilities.apiPayments.enabled },
    webhooks: capabilities.webhooks,
    cards: capabilities.cards,
    mbWay: capabilities.mbWay,
    installments: capabilities.installments,
  };
}
