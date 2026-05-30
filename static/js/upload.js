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
let compressedFile = null;

async function setFile(file) {
  if (!file) return;
  
  // Batas 50MB agar browser tidak crash saat membaca
  if (file.size > 50 * 1024 * 1024) { 
    showToast('❌ File terlalu besar (maks 50MB)'); 
    return; 
  }
  
  selectedFile = file;
  compressedFile = null;
  
  const compInfo = document.getElementById('compressionInfo');
  if (compInfo) {
    compInfo.classList.add('hidden');
    compInfo.classList.remove('flex');
  }

  // Nonaktifkan tombol analisis selama pemrosesan awal
  btnAnalyze.disabled = true;
  
  if (file.size < 2 * 1024 * 1024) {
    // Jika ukuran file di bawah 2MB, tidak perlu kompresi. Cukup baca untuk preview.
    btnText.textContent = '⏳ Memuat gambar…';
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      dropContent.classList.add('hidden');
      dropPreview.classList.remove('hidden');
      dropPreview.classList.add('flex');
      
      compressedFile = file; // Gunakan file asli langsung
      btnAnalyze.disabled = false;
      btnText.textContent = '🔍 Analisis Gambar';
    };
    reader.onerror = () => {
      showToast('❌ Gagal membaca file gambar.');
      clearFile();
    };
    reader.readAsDataURL(file);
  } else {
    // Jika ukuran file >= 2MB, lakukan kompresi secara aman setelah preview terpasang
    btnText.textContent = '⏳ Mengompresi gambar…';
    
    const reader = new FileReader();
    reader.onload = async e => {
      previewImg.src = e.target.result;
      dropContent.classList.add('hidden');
      dropPreview.classList.remove('hidden');
      dropPreview.classList.add('flex');
      
      try {
        // Jalankan kompresi setelah preview selesai dipasang
        compressedFile = await compressImage(file);
        
        const origSizeEl = document.getElementById('origSize');
        const compSizeEl = document.getElementById('compSize');
        const compRatioEl = document.getElementById('compRatio');
        
        if (compressedFile && compressedFile !== file) {
          const origSizeKB = (file.size / 1024).toFixed(1);
          const compSizeKB = (compressedFile.size / 1024).toFixed(1);
          const ratio = (((file.size - compressedFile.size) / file.size) * 100).toFixed(0);
          
          if (origSizeEl) origSizeEl.textContent = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${origSizeKB} KB`;
          if (compSizeEl) compSizeEl.textContent = compressedFile.size > 1024 * 1024 ? `${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB` : `${compSizeKB} KB`;
          if (compRatioEl) compRatioEl.textContent = ratio > 0 ? `-${ratio}%` : '0%';
          if (compInfo) {
            compInfo.classList.remove('hidden');
            compInfo.classList.add('flex');
          }
        }
        
        btnAnalyze.disabled = false;
        btnText.textContent = '🔍 Analisis Gambar';
      } catch (err) {
        showToast('❌ Gagal mengompresi gambar: ' + err.message);
        compressedFile = file; // Fallback ke file asli
        btnAnalyze.disabled = false;
        btnText.textContent = '🔍 Analisis Gambar';
      }
    };
    reader.onerror = () => {
      showToast('❌ Gagal membaca file gambar.');
      clearFile();
    };
    reader.readAsDataURL(file);
  }
}

function clearFile() {
  selectedFile = null;
  compressedFile = null;
  previewImg.src = '';
  dropPreview.classList.add('hidden');
  dropPreview.classList.remove('flex');
  dropContent.classList.remove('hidden');
  btnAnalyze.disabled = true;
  btnText.textContent = '🔍 Analisis Gambar';
  
  const compInfo = document.getElementById('compressionInfo');
  if (compInfo) {
    compInfo.classList.add('hidden');
    compInfo.classList.remove('flex');
  }
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
  const fileToUpload = compressedFile || selectedFile;
  if (!fileToUpload) return;
  
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btnLoader.classList.add('flex');
  btnAnalyze.disabled = true;

  try {
    const fd = new FormData();
    
    // Pastikan nama file menggunakan ekstensi .jpg karena dikompresi ke JPEG
    let fileName = selectedFile.name;
    if (compressedFile && compressedFile !== selectedFile) {
      const pos = fileName.lastIndexOf('.');
      if (pos !== -1) {
        fileName = fileName.substring(0, pos) + '.jpg';
      } else {
        fileName = fileName + '.jpg';
      }
    }
    
    fd.append('image', fileToUpload, fileName);
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
