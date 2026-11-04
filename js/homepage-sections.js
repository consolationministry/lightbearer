const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

for (const slideshow of document.querySelectorAll('[data-slideshow]')) {
  const slides = [...slideshow.querySelectorAll('.section-slide')];
  const status = slideshow.querySelector('[data-slide-status]');
  if (slides.length < 2) continue;
  let current = 0;
  let timer;

  const show = (next) => {
    current = (next + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      const active = index === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    if (status) status.textContent = `${current + 1} of ${slides.length}`;
  };
  const start = () => {
    clearInterval(timer);
    if (!prefersReducedMotion.matches) timer = setInterval(() => show(current + 1), 5000);
  };

  slideshow.querySelector('[data-slide-prev]')?.addEventListener('click', () => { show(current - 1); start(); });
  slideshow.querySelector('[data-slide-next]')?.addEventListener('click', () => { show(current + 1); start(); });
  slideshow.addEventListener('focusin', () => clearInterval(timer));
  slideshow.addEventListener('focusout', start);
  prefersReducedMotion.addEventListener?.('change', start);
  show(0);
  start();
}
