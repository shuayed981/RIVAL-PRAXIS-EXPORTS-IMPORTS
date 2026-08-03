if (!document.querySelector('script[data-rival-translate]')) {
  const translationScript = document.createElement("script");
  translationScript.src = "translate.js?v=20260803";
  translationScript.dataset.rivalTranslate = "true";
  document.head.append(translationScript);
}

window.RIVAL_PAYMENT_CONFIG = Object.freeze({
  enabled: false,
  commerceEnabled: false,
  apiBase: "https://payments.rivalpraxis.com/api",
  provider: "not-activated",
  supportedProviders: ["reduniq", "getnet"]
});
