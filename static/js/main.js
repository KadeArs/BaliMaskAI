/* main.js – global helpers */

// Hamburger
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
    mobileMenu.classList.toggle('flex');
  });
}

// Navbar scroll effect
const navbar = document.querySelector('.fixed.top-0');
window.addEventListener('scroll', () => {
  if (navbar) navbar.style.boxShadow = window.scrollY > 10 ? '0 4px 24px rgba(0,0,0,.5)' : '';
});

// Toast notification
function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('opacity-100','translate-y-0');
  t.classList.remove('opacity-0','translate-y-4');
  setTimeout(() => {
    t.classList.remove('opacity-100','translate-y-0');
    t.classList.add('opacity-0','translate-y-4');
  }, ms);
}

// Render detection result cards (shared by upload.js & scan.js)
function renderDetections(data, imgEl, infoEl, badgeEl) {
  if (imgEl) imgEl.src = 'data:image/jpeg;base64,' + data.result_image;

  if (badgeEl) {
    badgeEl.textContent = data.total_found > 0
      ? `${data.total_found} Topeng Terdeteksi`
      : 'Tidak Terdeteksi';
  }

  if (!infoEl) return;
  infoEl.innerHTML = '';

  if (data.total_found === 0) {
    infoEl.innerHTML = `<div class="text-center text-stone-500 text-sm py-4">
      ⚠️ Tidak ada topeng terdeteksi (confidence < 50%)
    </div>`;
    return;
  }

  // --- Grup deteksi berdasarkan class_name (pertahankan urutan kemunculan) ---
  const groups = {};
  const order  = [];
  data.detections.forEach(d => {
    if (!groups[d.class_name]) {
      groups[d.class_name] = { detections: [], description: d.description };
      order.push(d.class_name);
    }
    groups[d.class_name].detections.push(d);
  });

  order.forEach((className, cardIndex) => {
    const group  = groups[className];
    const dets   = group.detections;
    const maxPct = Math.min(Math.max(...dets.map(d => d.confidence)), 100);

    // Baris confidence + box per instance (1., 2., dst.)
    const instanceRows = dets.map((d, i) => `
      <div class="flex items-center gap-2 text-xs text-stone-400 mb-1">
        <span class="text-stone-600 w-4 shrink-0">${i + 1}.</span>
        <span>Confidence: <span class="text-amber-100 font-semibold">${d.confidence.toFixed(1)}%</span></span>
        <span class="text-stone-600">·</span>
        <span>Box: [${d.box.join(', ')}]</span>
      </div>`).join('');

    const card = document.createElement('div');
    card.className = 'bg-dark border border-gold/15 rounded-xl p-4 flex gap-3 items-start animate-fadeIn';
    card.innerHTML = `
      <div class="w-7 h-7 gold-gradient rounded-full flex items-center justify-center text-dark text-xs font-bold shrink-0">${cardIndex + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span class="font-serif text-gold text-base capitalize">${className}</span>
          ${dets.length > 1 ? `<span class="text-xs bg-gold/15 text-gold/80 rounded-full px-2 py-0.5">${dets.length}×</span>` : ''}
        </div>
        ${instanceRows}
        <div class="h-1 rounded-full bg-white/10 my-2 overflow-hidden">
          <div class="h-full conf-bar rounded-full" style="width:0%;background:linear-gradient(90deg,#A0800A,#D4AF37)"
               data-target="${maxPct}"></div>
        </div>
        ${group.description ? `<p class="text-stone-500 text-xs leading-relaxed mt-1">${group.description}</p>` : ''}
        <div class="mt-3">
          <a href="/detail/${encodeURIComponent(className)}"
             class="inline-flex items-center gap-1.5 text-xs font-semibold text-dark gold-gradient px-4 py-1.5 rounded-full hover:shadow-[0_2px_12px_rgba(212,175,55,.35)] transition-all">
            🔍 Lihat Detail
          </a>
        </div>
      </div>`;
    infoEl.appendChild(card);
  });

  // Animate bars
  requestAnimationFrame(() => {
    infoEl.querySelectorAll('.conf-bar').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  });

  // Meta info
  const meta = document.createElement('div');
  meta.className = 'text-right text-xs text-stone-600';
  meta.textContent = `\u23f1 ${data.inference_time}ms \u00b7 ${data.image_size[0]}\u00d7${data.image_size[1]}px \u00b7 ${data.device}`;
  infoEl.appendChild(meta);
}
