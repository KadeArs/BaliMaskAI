/* upload.js */
const dropZone     = document.getElementById('dropZone');
const dropContent  = document.getElementById('dropZoneContent');
const dropPreview  = document.getElementById('dropPreview');
const previewImg   = document.getElementById('previewImg');
const fileInput    = document.getElementById('fileInput');
const btnRemove    = document.getElementById('btnRemoveImg');
const btnAnalyze   = document.getElementById('btnAnalyze');
const btnText      = document.getElementById('btnText');
const btnLoader    = document.getElementById('btnLoader');
const placeholder  = document.getElementById('resultPlaceholder');
const resultContent= document.getElementById('resultContent');
const resultImg    = document.getElementById('resultImg');
const resultBadge  = document.getElementById('resultBadge');
const resultInfo   = document.getElementById('resultInfo');
const btnReset     = document.getElementById('btnReset');

let selectedFile = null;

function setFile(file) {
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) { showToast('❌ File terlalu besar (maks 16MB)'); return; }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    dropContent.classList.add('hidden');
    dropPreview.classList.remove('hidden');
    dropPreview.classList.add('flex');
    btnAnalyze.disabled = false;
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  selectedFile = null;
  previewImg.src = '';
  dropPreview.classList.add('hidden');
  dropPreview.classList.remove('flex');
  dropContent.classList.remove('hidden');
  btnAnalyze.disabled = true;
}

dropZone.addEventListener('click', e => {
  if (e.target === btnRemove || btnRemove.contains(e.target)) return;
  fileInput.click();
});
fileInput.addEventListener('change', () => fileInput.files[0] && setFile(fileInput.files[0]));
btnRemove.addEventListener('click', e => { e.stopPropagation(); clearFile(); });
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('border-gold/70','bg-gold/5'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-gold/70','bg-gold/5'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('border-gold/70','bg-gold/5');
  const f = e.dataTransfer.files[0];
  if (f) setFile(f);
});

btnAnalyze.addEventListener('click', async () => {
  if (!selectedFile) return;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btnLoader.classList.add('flex');
  btnAnalyze.disabled = true;

  try {
    const fd = new FormData();
    fd.append('image', selectedFile);
    const res = await fetch('/predict', { method: 'POST', body: fd });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    placeholder.classList.add('hidden');
    resultContent.classList.remove('hidden');
    resultContent.classList.add('flex');
    renderDetections(data, resultImg, resultInfo, resultBadge);
    showToast(`✅ Selesai! ${data.total_found} topeng terdeteksi dalam ${data.inference_time}ms`);
  } catch(err) {
    showToast('❌ ' + (err.message || 'Gagal menganalisis gambar'));
  } finally {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btnLoader.classList.remove('flex');
    btnAnalyze.disabled = false;
  }
});

btnReset && btnReset.addEventListener('click', () => {
  clearFile();
  resultContent.classList.add('hidden');
  resultContent.classList.remove('flex');
  placeholder.classList.remove('hidden');
  resultInfo.innerHTML = '';
  resultImg.src = '';
  if (resultBadge) resultBadge.textContent = '';
});
