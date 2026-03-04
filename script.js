/* ─── TEXT ROTATOR ─── */
const rotator = document.querySelector("[data-rotator]");

if (rotator) {
  const words = rotator.dataset.words
    .split("|")
    .map((w) => w.trim())
    .filter(Boolean);

  const list = rotator.querySelector(".rotator__list");

  if (list && words.length) {
    list.innerHTML = words
      .concat(words[0])
      .map((w) => `<span class="rotator__item">${w}</span>`)
      .join("");

    const measureAndSetWidth = () => {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
      probe.style.font = getComputedStyle(rotator).font;
      document.body.appendChild(probe);
      let maxW = 0;
      words.forEach((w) => {
        probe.textContent = w;
        maxW = Math.max(maxW, probe.getBoundingClientRect().width);
      });
      document.body.removeChild(probe);
      rotator.style.setProperty("--rotator-width", `${Math.ceil(maxW)}px`);
    };

    const startRotation = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || words.length < 2) return;

      let index = 0;
      const duration = 600;
      const pause = 1800;
      const firstItem = list.querySelector(".rotator__item");
      const gap = parseFloat(getComputedStyle(rotator).getPropertyValue("--rotator-gap")) || 0;
      const step = firstItem ? firstItem.getBoundingClientRect().height + gap : 0;

      const setTransform = (i, animate) => {
        list.style.transition = animate
          ? `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
          : "none";
        list.style.transform = `translateY(${-i * step}px)`;
        if (!animate) void list.offsetHeight;
      };

      setTransform(0, false);

      const tick = () => {
        index += 1;
        setTransform(index, true);
        setTimeout(() => {
          if (index === words.length) {
            index = 0;
            setTransform(0, false);
          }
          setTimeout(tick, pause);
        }, duration);
      };

      setTimeout(tick, pause);
    };

    const init = () => { measureAndSetWidth(); startRotation(); };
    document.fonts?.ready ? document.fonts.ready.then(init) : window.addEventListener("load", init);
  }
}

/* ─── WAITLIST FORM ─── */
function setupWaitlistForm(formId, successId, errorId) {
  const form = document.getElementById(formId);
  if (!form) return;

  const successEl = document.getElementById(successId);
  const errorEl = document.getElementById(errorId);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector("input[type='email']");
    const btnText = form.querySelector(".btn-text");
    const btnLoading = form.querySelector(".btn-loading");
    const submitBtn = form.querySelector("button[type='submit']");

    const email = emailInput.value.trim();
    if (!email) return;

    // Loading state
    submitBtn.disabled = true;
    btnText?.setAttribute("hidden", "");
    btnLoading?.removeAttribute("hidden");
    if (errorEl) errorEl.setAttribute("hidden", "");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        submitBtn.disabled = false;
        btnText?.removeAttribute("hidden");
        btnLoading?.setAttribute("hidden", "");
        form.setAttribute("hidden", "");
        if (successEl) successEl.removeAttribute("hidden");
      } else {
        if (errorEl) {
          errorEl.textContent = data.error || "Something went wrong. Please try again.";
          errorEl.removeAttribute("hidden");
        }
        submitBtn.disabled = false;
        btnText?.removeAttribute("hidden");
        btnLoading?.setAttribute("hidden", "");
      }
    } catch {
      if (errorEl) {
        errorEl.textContent = "Network error — please try again.";
        errorEl.removeAttribute("hidden");
      }
      submitBtn.disabled = false;
      btnText?.removeAttribute("hidden");
      btnLoading?.setAttribute("hidden", "");
    }
  });
}

setupWaitlistForm("waitlist-form", "form-success", "form-error");
setupWaitlistForm("waitlist-form-bottom", "form-success-bottom", null);
