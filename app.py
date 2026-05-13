"""
Bali Mask Recognition - Flask Application
Sistem deteksi topeng Bali menggunakan SSDLite MobileNetV3 (PyTorch)
"""

import os
import io
import re
import json
import base64
import time
import cv2
import torch
import numpy as np
import openpyxl
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory, abort
from torchvision.models.detection import ssdlite320_mobilenet_v3_large
from werkzeug.utils import secure_filename
from PIL import Image

# ==========================================
# KONFIGURASI APLIKASI
# ==========================================
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Max 16MB upload
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['SECRET_KEY'] = 'bali-mask-recognition-secret-key'

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp', 'heic'}

# ==========================================
# KONFIGURASI MODEL
# ==========================================
MODEL_WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'best_model_FINAL.pth')

# Nama kelas topeng Bali (index 0 = background)
CLASS_NAMES = [
    'background', 'bondres', 'bujuh', 'dalem',
    'keras', 'penasar', 'sidakarya', 'tua', 'wijil'
]

# ==========================================
# LOAD DATA TOPENG DARI EXCEL
# ==========================================
# File: trainModel/dekripsi/detail.xlsx
# Kolom: Nama Topeng | Dekripsi Singkat | Dekripsi Detail | Dekripsi Kecil
DETAIL_EXCEL_PATH = os.path.join(os.path.dirname(__file__), 'detail', 'detail.xlsx')

# Mapping nama file gambar per topeng
MASK_IMAGE_FILES = {
    'bondres':   'bondres.jpg',
    'bujuh':     'bujuh.jpg',
    'dalem':     'dalem.jpeg',
    'keras':     'keras.jpeg',
    'penasar':   'penasar.jpg',
    'sidakarya': 'sidakarya.jpg',
    'tua':       'tua.jpg',
    'wijil':     'wijil.jpg',
}


def _load_mask_data_from_excel():
    """
    Baca data topeng dari dekripsi/detail.xlsx.
    Format kolom: Nama Topeng | Dekripsi Singkat | Dekripsi Detail | Dekripsi Kecil
    Nama Topeng: 'Topeng Tua', 'Topeng Bondres', dst.
    Mengembalikan dict key = nama kelas lowercase ('tua', 'bondres', dst.)
    """
    data = {}
    try:
        wb = openpyxl.load_workbook(DETAIL_EXCEL_PATH)
        ws = wb.active
        for row in ws.iter_rows(values_only=True):
            if not row[0]:
                continue
            nama_raw = str(row[0]).strip()
            if nama_raw.lower().startswith('nama'):   # lewati header
                continue
            # 'Topeng Tua' → 'tua', 'Topeng Bondres' → 'bondres'
            key = re.sub(r'^topeng\s+', '', nama_raw, flags=re.IGNORECASE).strip().lower()
            key = re.sub(r'\s+', '_', key)
            if not key or key not in MASK_IMAGE_FILES:
                continue
            singkat = str(row[1]).strip() if len(row) > 1 and row[1] else ''
            detail  = str(row[2]).strip() if len(row) > 2 and row[2] else ''
            kecil   = str(row[3]).strip() if len(row) > 3 and row[3] else singkat
            data[key] = {
                'nama':             nama_raw,
                'dekripsi_singkat': singkat,
                'dekripsi_detail':  detail,
                'dekripsi_kecil':   kecil,
                'image_file':       MASK_IMAGE_FILES[key],
            }
        print('Data topeng dimuat dari detail.xlsx: ' + str(list(data.keys())))
    except FileNotFoundError:
        print('[WARN] dekripsi/detail.xlsx tidak ditemukan!')
    except Exception as e:
        print('[WARN] Gagal membaca detail.xlsx: ' + str(e))
    return data

MASK_DATA = _load_mask_data_from_excel()

# Deskripsi KECIL (1 kalimat) – untuk hasil scan/upload sebelum halaman detail
MASK_DESCRIPTIONS = {
    key: info.get('dekripsi_kecil', '') or info.get('dekripsi_singkat', '')
    for key, info in MASK_DATA.items()
}

NUM_CLASSES = len(CLASS_NAMES)
CONFIDENCE_THRESHOLD = 0.7

# Warna bounding box per kelas (BGR untuk OpenCV → dikonversi ke RGB)
CLASS_COLORS = {
    'bondres':    (255, 100, 0),
    'bujuh':      (180, 50, 200),
    'dalem':      (0, 180, 255),
    'keras':      (255, 50, 50),
    'penasar':    (50, 200, 50),
    'sidakarya':  (255, 200, 0),
    'tua':        (200, 100, 50),
    'wijil':      (100, 200, 255),
    'background': (150, 150, 150),
}

# ==========================================
# INISIALISASI MODEL (GLOBAL)
# ==========================================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None
model_loaded = False
model_error = None


def load_model():
    """Load model PyTorch SSDLite MobileNetV3."""
    global model, model_loaded, model_error
    try:
        if not os.path.exists(MODEL_WEIGHTS_PATH):
            model_error = f"File model tidak ditemukan: {MODEL_WEIGHTS_PATH}"
            print(f"⚠️  {model_error}")
            return False

        print(">> Memuat arsitektur model SSDLite MobileNetV3...")
        m = ssdlite320_mobilenet_v3_large(weights='DEFAULT')
        m.head.classification_head.num_classes = NUM_CLASSES

        print(">> Memuat bobot model terlatih...")
        state_dict = torch.load(MODEL_WEIGHTS_PATH, map_location=device)
        m.load_state_dict(state_dict)
        m.to(device)
        m.eval()

        model = m
        model_loaded = True
        print(f"✅ Model berhasil dimuat! Device: {device}")
        return True

    except Exception as e:
        model_error = str(e)
        print(f"❌ Gagal memuat model: {e}")
        return False


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def run_inference(image_path):
    """
    Jalankan inference model pada gambar.
    Returns: dict dengan boxes, labels, scores, dan gambar hasil ber-bounding box (base64).
    """
    start_time = time.time()

    # Baca gambar
    image_bgr = cv2.imread(image_path)
    if image_bgr is None:
        raise ValueError("Gambar tidak dapat dibaca atau format tidak didukung.")

    original_h, original_w = image_bgr.shape[:2]
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    # Konversi ke tensor (normalisasi 0-1)
    img_tensor = torch.tensor(
        image_rgb / 255.0, dtype=torch.float32
    ).permute(2, 0, 1).unsqueeze(0).to(device)

    # Inference
    with torch.no_grad():
        predictions = model(img_tensor)[0]

    boxes  = predictions['boxes'].cpu().numpy()
    labels = predictions['labels'].cpu().numpy()
    scores = predictions['scores'].cpu().numpy()

    elapsed = time.time() - start_time

    # ── 1. Filter confidence threshold ──────────────────────────────
    mask      = scores >= CONFIDENCE_THRESHOLD
    boxes_f   = boxes[mask]
    labels_f  = labels[mask]
    scores_f  = scores[mask]

    # ── 2. NMS per kelas (hapus box tumpang-tindih) ─────────────────
    NMS_IOU_THRESHOLD = 0.4
    keep_indices = []
    for cls_id in np.unique(labels_f):
        cls_mask   = labels_f == cls_id
        cls_boxes  = torch.tensor(boxes_f[cls_mask],  dtype=torch.float32)
        cls_scores = torch.tensor(scores_f[cls_mask], dtype=torch.float32)
        from torchvision.ops import nms as torchvision_nms
        kept = torchvision_nms(cls_boxes, cls_scores, NMS_IOU_THRESHOLD).numpy()
        # kembalikan ke indeks global dalam boxes_f
        global_idx = np.where(cls_mask)[0]
        keep_indices.extend(global_idx[kept].tolist())

    # Urutkan berdasarkan score tertinggi
    keep_indices = sorted(keep_indices, key=lambda i: scores_f[i], reverse=True)

    # ── 3. Gambar bounding box & kumpulkan detections ────────────────
    detections = []
    result_image = image_rgb.copy()
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.6, min(original_w, original_h) / 600)
    thickness  = max(2, int(min(original_w, original_h) / 200))

    for i in keep_indices:
        class_id   = int(labels_f[i])
        class_name = CLASS_NAMES[class_id] if class_id < len(CLASS_NAMES) else f"unknown-{class_id}"
        confidence = float(scores_f[i])

        x1, y1, x2, y2 = [int(v) for v in boxes_f[i]]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(original_w - 1, x2), min(original_h - 1, y2)

        color = CLASS_COLORS.get(class_name, (200, 200, 200))

        # Gambar bounding box
        cv2.rectangle(result_image, (x1, y1), (x2, y2), color, thickness)

        # Label teks
        label_text = f"{class_name}: {confidence * 100:.1f}%"
        text_size, _ = cv2.getTextSize(label_text, font, font_scale, thickness)
        label_y = max(y1, text_size[1] + 10)

        # Background label
        cv2.rectangle(
            result_image,
            (x1, label_y - text_size[1] - 8),
            (x1 + text_size[0] + 6, label_y + 4),
            color, -1
        )
        cv2.putText(
            result_image, label_text,
            (x1 + 3, label_y - 2),
            font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA
        )

        detections.append({
            'class_id':    class_id,
            'class_name':  class_name,
            'confidence':  round(confidence * 100, 2),
            'box':         [x1, y1, x2, y2],
            'description': MASK_DESCRIPTIONS.get(class_name, '')
        })

    # Encode hasil gambar ke base64
    _, buffer = cv2.imencode('.jpg', cv2.cvtColor(result_image, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    result_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        'detections':    detections,
        'result_image':  result_b64,
        'total_found':   len(detections),
        'inference_time': round(elapsed * 1000, 1),  # ms
        'image_size':    [original_w, original_h],
        'device':        str(device)
    }


# ==========================================
# ROUTES
# ==========================================

@app.route('/')
def home():
    """Halaman Beranda."""
    return render_template('index.html',
                           model_loaded=model_loaded,
                           model_error=model_error,
                           class_names=CLASS_NAMES[1:])


@app.route('/scan')
def scan():
    """Halaman Scan menggunakan kamera."""
    return render_template('scan.html',
                           model_loaded=model_loaded)


@app.route('/upload')
def upload():
    """Halaman Upload gambar."""
    return render_template('upload.html',
                           model_loaded=model_loaded)


@app.route('/about')
def about():
    """Halaman Tentang."""
    return render_template('about.html',
                           model_loaded=model_loaded,
                           device=str(device),
                           num_classes=NUM_CLASSES - 1,
                           class_names=CLASS_NAMES[1:])


@app.route('/detail/<mask_name>')
def detail(mask_name):
    """Halaman detail deskripsi topeng."""
    mask_name = mask_name.lower().strip()
    mask_info = MASK_DATA.get(mask_name)
    if not mask_info:
        abort(404)
    return render_template('detail.html',
                           mask_name=mask_name,
                           mask_info=mask_info,
                           model_loaded=model_loaded)


@app.route('/mask_image/<mask_name>')
def mask_image(mask_name):
    """Serve gambar topeng dari folder detail."""
    mask_name = mask_name.lower().strip()
    img_file = MASK_IMAGE_FILES.get(mask_name)
    if not img_file:
        abort(404)
    detail_dir = os.path.join('static','images','masks')
    return send_from_directory(detail_dir, img_file)


@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint inference: menerima gambar, mengembalikan JSON hasil deteksi."""
    if not model_loaded:
        return jsonify({
            'success': False,
            'error': 'Model belum siap. ' + (model_error or 'Silakan coba lagi.')
        }), 503

    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'Tidak ada file gambar yang dikirim.'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Nama file kosong.'}), 400

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Format file tidak didukung. Gunakan PNG, JPG, atau JPEG.'}), 400

    try:
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)

        result = run_inference(save_path)
        result['success'] = True

        # Hapus file setelah diproses
        try:
            os.remove(save_path)
        except Exception:
            pass

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/predict_camera', methods=['POST'])
def predict_camera():
    """Endpoint inference dari frame kamera (base64 JPEG)."""
    if not model_loaded:
        return jsonify({'success': False, 'error': 'Model belum siap.'}), 503

    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'success': False, 'error': 'Data gambar tidak ditemukan.'}), 400

        # Decode base64 image
        img_data = data['image']
        if ',' in img_data:
            img_data = img_data.split(',')[1]

        img_bytes = base64.b64decode(img_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image_bgr is None:
            return jsonify({'success': False, 'error': 'Gagal memproses frame kamera.'}), 400

        # Simpan sementara
        tmp_path = os.path.join(app.config['UPLOAD_FOLDER'], '_camera_frame.jpg')
        cv2.imwrite(tmp_path, image_bgr)

        result = run_inference(tmp_path)
        result['success'] = True

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/status')
def api_status():
    """Status API dan model."""
    return jsonify({
        'status':        'ok',
        'model_loaded':  model_loaded,
        'model_error':   model_error,
        'device':        str(device),
        'num_classes':   NUM_CLASSES - 1,
        'class_names':   CLASS_NAMES[1:],
        'threshold':     CONFIDENCE_THRESHOLD
    })


# ==========================================
# MAIN
# ==========================================
if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    print("=" * 60)
    print("  Bali Mask Recognition - AI System")
    print("=" * 60)
    load_model()
    print("=" * 60)
    print(f"  Server: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
