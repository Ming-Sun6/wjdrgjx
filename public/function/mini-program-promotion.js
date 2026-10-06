(() => {
  const banner = document.getElementById('miniProgramPromotion');
  const dialog = document.getElementById('miniProgramQrDialog');
  if (!banner || !dialog) return;
  const entry = document.getElementById('miniProgramEntry');
  const openQr = () => { if (!dialog.open) dialog.showModal(); };
  banner.querySelector('[data-mini-qr]').addEventListener('click', openQr);
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  entry.addEventListener('click', event => {
    if (!entry.dataset.direct) { event.preventDefault(); openQr(); }
  });
  fetch('/api/mini-program-promotion', { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('promotion unavailable'); return response.json(); })
    .then(({ promotion }) => {
      if (!promotion || !promotion.enabled) return;
      if (promotion.urlLink) {
        const url = new URL(promotion.urlLink);
        if (url.protocol === 'https:' && ['wxaurl.cn', 'wxmpurl.cn'].includes(url.hostname) && !url.username && !url.password && !url.port) {
          entry.href = url.href;
          entry.dataset.direct = 'true';
        }
      }
      banner.hidden = false;
    }).catch(() => { banner.hidden = true; });
})();
