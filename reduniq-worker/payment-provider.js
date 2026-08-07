import { reduniqProvider } from "./reduniq-provider.js";

const providers = Object.freeze({ reduniq: reduniqProvider });

export function getPaymentProvider(env) {
  const providerId = String(env.PAYMENT_PROVIDER || "reduniq").toLowerCase();
  const provider = providers[providerId];
  if (!provider) throw new Error("PAYMENT_PROVIDER_UNSUPPORTED");
  return provider;
}
