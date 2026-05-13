/* scan.js */
const btnStart      = document.getElementById('btnStartCamera');
const btnCapture    = document.getElementById('btnCapture');
const btnStop       = document.getElementById('btnStopCamera');
const btnScanAgain  = document.getElementById('btnScanAgain');
const video         = document.getElementById('cameraFeed');
const canvas        = document.getElementById('cameraCanvas');
const placeholder   = document.getElementById('cameraPlaceholder');
const controls      = document.getElementById('cameraControls');
const overlay       = document.getElementById('scanOverlay');
const resPlaceholder= document.getElementById('scanResultPlaceholder');
const resContent    = document.getElementById('scanResultContent');
const resImg        = document.getElementById('scanResultImg');
const resInfo       = document.getElementById('scanResultInfo');

let stream = null;

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment', width:{ ideal:1280 }, height:{ ideal:720 } }, audio: false });
    video.srcObject = stream;
    placeholder.classList.add('hidden');
    video.classList.remove('hidden');
    controls.classList.remove('hidden');
    controls.classList.add('flex');
    overlay.classList.remove('hidden');
    showToast('📷 Kamera aktif');
  } catch(e) {
    showToast('❌ Tidak dapat mengakses kamera: ' + e.message);
  }
}

function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.classList.add('hidden');
  controls.classList.add('hidden');
  controls.classList.remove('flex');
  overlay.classList.add('hidden');
  placeholder.classList.remove('hidden');
  showToast('🛑 Kamera dimatikan');
}

async function captureAndAnalyze() {
  if (!stream) return;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const b64 = canvas.toDataURL('image/jpeg', 0.9);

  btnCapture.disabled = true;
  btnCapture.textContent = '⏳ Menganalisis…';

  try {
    const res = await fetch('/predict_camera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64 })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    resPlaceholder.classList.add('hidden');
    resContent.classList.remove('hidden');
    resContent.classList.add('flex');
    renderDetections(data, resImg, resInfo, null);
    showToast(`✅ ${data.total_found} topeng terdeteksi (${data.inference_time}ms)`);
  } catch(e) {
    showToast('❌ ' + (e.message || 'Gagal menganalisis'));
  } finally {
    btnCapture.disabled = false;
    btnCapture.textContent = '📸 Ambil & Analisis';
  }
}

btnStart   && btnStart.addEventListener('click', startCamera);
btnStop    && btnStop.addEventListener('click', stopCamera);
btnCapture && btnCapture.addEventListener('click', captureAndAnalyze);
btnScanAgain && btnScanAgain.addEventListener('click', () => {
  resContent.classList.add('hidden');
  resContent.classList.remove('flex');
  resPlaceholder.classList.remove('hidden');
  resInfo.innerHTML = '';
  resImg.src = '';
});
