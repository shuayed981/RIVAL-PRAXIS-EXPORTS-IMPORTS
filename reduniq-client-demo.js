(() => {
  "use strict";
  const screens = [...document.querySelectorAll(".demo-screen")];
  const back = document.getElementById("demo-back");
  const next = document.getElementById("demo-next");
  const count = document.getElementById("demo-step-count");
  const bar = document.getElementById("demo-progress-bar");
  let current = 0;

  function render() {
    screens.forEach((screen, index) => screen.classList.toggle("active", index === current));
    count.textContent = `Step ${current + 1} of ${screens.length} · ${screens[current].dataset.title}`;
    bar.style.width = `${((current + 1) / screens.length) * 100}%`;
    back.disabled = current === 0;
    next.textContent = current === screens.length - 1 ? "Restart Demo" : "Next Step";
    document.querySelector(".demo-stage").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  back.addEventListener("click", () => { if (current > 0) current -= 1; render(); });
  next.addEventListener("click", () => { current = current === screens.length - 1 ? 0 : current + 1; render(); });
  render();
})();
