(() => {
  if (window.__rivalPraxisTranslateLoaded) return;
  window.__rivalPraxisTranslateLoaded = true;

  const mount = () => {
    if (document.getElementById("google_translate_element")) return;
    const panel = document.createElement("aside");
    panel.className = "translation-panel notranslate";
    panel.setAttribute("aria-label", "Translate this page");
    panel.innerHTML = '<span aria-hidden="true">文</span><div><strong>Language</strong><div id="google_translate_element"></div></div>';
    document.body.append(panel);
  };

  const style = document.createElement("style");
  style.textContent = '.translation-panel{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 32px);padding:9px 12px;border:1px solid rgba(33,26,22,.18);border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 8px 28px rgba(0,0,0,.16);color:#211a16;font:12px/1.2 Arial,sans-serif}.translation-panel>span{font-size:20px;color:#8c1d40}.translation-panel strong{display:block;margin-bottom:3px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.translation-panel select{max-width:190px;min-height:30px;border:1px solid #cfc5bd;border-radius:6px;background:#fff;color:#211a16}.goog-logo-link,.goog-te-gadget span{display:none!important}.goog-te-gadget{font-size:0!important}.goog-te-banner-frame.skiptranslate{display:none!important}body{top:0!important}@media(max-width:480px){.translation-panel{right:10px;bottom:10px;padding:7px 9px}.translation-panel strong,.translation-panel>span{display:none}.translation-panel select{max-width:145px}}@media print{.translation-panel{display:none!important}}';
  document.head.append(style);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();

  window.googleTranslateElementInit = () => {
    if (!window.google?.translate?.TranslateElement) return;
    new google.translate.TranslateElement({
      pageLanguage: "en",
      autoDisplay: false,
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, "google_translate_element");
  };

  const provider = document.createElement("script");
  provider.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  provider.async = true;
  provider.referrerPolicy = "no-referrer-when-downgrade";
  document.head.append(provider);
})();
