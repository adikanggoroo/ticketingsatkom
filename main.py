from flask import Flask, request, render_template, jsonify, send_from_directory
import gspread
from datetime import datetime
import os

app = Flask(__name__, template_folder='.')

# --- Konfigurasi Google Sheets ---
SERVICE_ACCOUNT_FILE = 'ticketing-bank-raya-4a3e5d279573.json'
SPREADSHEET_NAME = 'Main_database_ticket_antigravity'

try:
    gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
    sh = gc.open(SPREADSHEET_NAME)
    worksheet = sh.get_worksheet(0)
    print("✅ Berhasil terhubung ke Google Sheets")
except Exception as e:
    print(f"❌ Error Koneksi: {e}")

# --- FUNGSI AGAR CSS/JS TERBACA ---
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory('assets', filename)

# --- ROUTES HTML ---

# Pintu Utama (Bisa diakses tanpa tulisan index.html)
@app.route('/')
@app.route('/index.html') # <-- Menambahkan ini agar index.html tidak NOT FOUND
def home():
    return render_template('index.html')

@app.route('/landing.html')
def landing():
    return render_template('landing.html')

@app.route('/auth.html')
def auth():
    return render_template('auth.html')

# --- API LOG ---
@app.route('/api/log', methods=['POST'])
def save_log():
    try:
        data = request.get_json()
        
        # Susun kolom sesuai urutan yang Bapak inginkan di Google Sheets
        # Contoh: Waktu, ID, Aksi, Judul, Kategori, Prioritas, Pelapor, Dep, Deskripsi
        row = [
            data.get('timestamp'),
            data.get('ticket_id'),
            data.get('action'),
            data.get('title'),
            data.get('category'),
            data.get('priority'),
            data.get('requester'),
            data.get('department'),
            data.get('details')
        ]
        
        worksheet.append_row(row)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=8000, debug=True)