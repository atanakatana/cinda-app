import datetime
import re
import random
from datetime import timedelta
from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func, or_
from sqlalchemy.orm import joinedload
from calendar import monthrange
import logging

# Inisialisasi aplikasi Flask
app = Flask(__name__)
# Konfigurasi database SQLite
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///penjualan.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Setup logging
logging.basicConfig(level=logging.INFO)

# Inisialisasi SQLAlchemy
db = SQLAlchemy(app)

# --- HARGA KONSTAN (SEBAGAI DEFAULT) ---
HARGA_BELI_DEFAULT = 8000
HARGA_JUAL_DEFAULT = 10000

# menambah konstanta profit sharing
# total profit per produk = 10000 - 8000 = 2000
# profit owner = 75% x 2000 = 1500
# profit superowner = 25% x 2000 = 500
PROFIT_SHARE_OWNER_RATIO = 0.75
PROFIT_SHARE_SUPEROWNER_RATIO = 0.25
# ===================================================================
# DEFINISI MODEL DATABASE
# ===================================================================

product_lapak_association = db.Table('product_lapak',
    db.Column('product_id', db.Integer, db.ForeignKey('product.id'), primary_key=True),
    db.Column('lapak_id', db.Integer, db.ForeignKey('lapak.id'), primary_key=True)
)

lapak_anggota_association = db.Table('lapak_anggota',
    db.Column('lapak_id', db.Integer, db.ForeignKey('lapak.id'), primary_key=True),
    db.Column('admin_id', db.Integer, db.ForeignKey('admin.id'), primary_key=True)
)

class Admin(db.Model):
    __tablename__ = 'admin'
    id = db.Column(db.Integer, primary_key=True)
    nama_lengkap = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(80), nullable=False) # Hapus unique=True
    email = db.Column(db.String(120), nullable=False) # Hapus unique=True
    nomor_kontak = db.Column(db.String(20), nullable=True)
    password = db.Column(db.String(120), nullable=False)
    super_owner_id= db.Column(db.Integer, db.ForeignKey('super_owner.id'), nullable=True)
    created_by_owner_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=True)

    # TAMBAHKAN INI: Aturan unik baru per owner
    __table_args__ = (
        db.UniqueConstraint('created_by_owner_id', 'username', name='_owner_username_uc'),
        db.UniqueConstraint('created_by_owner_id', 'email', name='_owner_email_uc')
    )

class SuperOwner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nama_lengkap = db.Column(db.String(100), nullable=True)
    username = db.Column(db.String(80), unique=True, nullable=False) # Username tetap wajib
    email = db.Column(db.String(120), unique=True, nullable=True)
    nomor_kontak = db.Column(db.String(20), nullable=True)
    password = db.Column(db.String(120), nullable=False) # Password tetap wajib
    #relasi ke owner
    owners= db.relationship('Admin', backref='super_owner', lazy=True)

class Supplier(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nama_supplier = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(80), nullable=False) # Hapus unique=True
    kontak = db.Column(db.String(20), nullable=True)
    nomor_register = db.Column(db.String(50), nullable=True) # Hapus unique=True
    alamat = db.Column(db.Text, nullable=True)
    password = db.Column(db.String(120), nullable=False)
    metode_pembayaran = db.Column(db.String(20), nullable=True)
    nomor_rekening = db.Column(db.String(50), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False)
    products = db.relationship('Product', backref='supplier', lazy=True, cascade="all, delete-orphan")
    balance = db.relationship('SupplierBalance', backref='supplier', uselist=False, cascade="all, delete-orphan")

    # TAMBAHKAN INI: Aturan unik baru per owner
    __table_args__ = (
        db.UniqueConstraint('owner_id', 'username', name='_owner_supplier_username_uc'),
        db.UniqueConstraint('owner_id', 'nomor_register', name='_owner_supplier_reg_uc')
    )
    
class Lapak(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lokasi = db.Column(db.String(200), nullable=False) # Hapus unique=True
    user_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False) # Penanggung Jawab
    owner_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False) #relasi ke owner
    penanggung_jawab = db.relationship('Admin', foreign_keys=[user_id], backref=db.backref('lapak_pj', uselist=False))
    anggota = db.relationship('Admin', secondary=lapak_anggota_association, lazy='subquery',
                              backref=db.backref('lapak_anggota', lazy=True))
    reports = db.relationship('LaporanHarian', backref='lapak', lazy=True, cascade="all, delete-orphan")

    # TAMBAHKAN INI: Aturan unik baru per owner
    __table_args__ = (
        db.UniqueConstraint('owner_id', 'lokasi', name='_owner_lapak_lokasi_uc'),
    )

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nama_produk = db.Column(db.String(100), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('supplier.id'), nullable=True)
    harga_beli = db.Column(db.Float, nullable=False, default=HARGA_BELI_DEFAULT)
    harga_jual = db.Column(db.Float, nullable=False, default=HARGA_JUAL_DEFAULT)
    is_manual = db.Column(db.Boolean, default=False, nullable=False)
    lapaks = db.relationship('Lapak', secondary=product_lapak_association, lazy='subquery',
                             backref=db.backref('products', lazy=True))

class StokHarian(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lapak_id = db.Column(db.Integer, db.ForeignKey('lapak.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    jumlah_sisa = db.Column(db.Integer, nullable=False)
    tanggal = db.Column(db.Date, default=datetime.date.today, nullable=False)
    __table_args__ = (db.UniqueConstraint('lapak_id', 'product_id', 'tanggal', name='_lapak_product_date_uc'),)

class LaporanHarian(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lapak_id = db.Column(db.Integer, db.ForeignKey('lapak.id'), nullable=False)
    tanggal = db.Column(db.Date, nullable=False, default=datetime.date.today)
    total_pendapatan = db.Column(db.Float, nullable=False)
    total_biaya_supplier = db.Column(db.Float, nullable=False, default=0)
    pendapatan_cash = db.Column(db.Float, nullable=False)
    pendapatan_qris = db.Column(db.Float, nullable=False)
    pendapatan_bca = db.Column(db.Float, nullable=False) 
    total_produk_terjual = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default='Menunggu Konfirmasi')
    manual_pendapatan_cash = db.Column(db.Float, nullable=True)
    manual_pendapatan_qris = db.Column(db.Float, nullable=True)
    manual_pendapatan_bca = db.Column(db.Float, nullable=True)
    manual_total_pendapatan = db.Column(db.Float, nullable=True)
    #kolom tambahan untuk profit sharing
    keuntungan_owner = db.Column(db.Float, nullable=True, default=0.0)
    keuntungan_superowner = db.Column(db.Float, nullable=True, default=0.0)
    rincian_produk = db.relationship('LaporanHarianProduk', backref='laporan', lazy=True, cascade="all, delete-orphan")

class LaporanHarianProduk(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    laporan_id = db.Column(db.Integer, db.ForeignKey('laporan_harian.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    stok_awal = db.Column(db.Integer, nullable=False)
    stok_akhir = db.Column(db.Integer, nullable=False)
    jumlah_terjual = db.Column(db.Integer, nullable=False)
    total_harga_jual = db.Column(db.Float, nullable=False)
    total_harga_beli = db.Column(db.Float, nullable=False)
    product = db.relationship('Product')

class SupplierBalance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('supplier.id'), unique=True, nullable=False)
    balance = db.Column(db.Float, nullable=False, default=0.0)
    
class SuperOwnerBalance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    super_owner_id = db.Column(db.Integer, db.ForeignKey('super_owner.id'), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=False)
    balance = db.Column(db.Float, nullable=False, default=0.0)
    
    super_owner = db.relationship('SuperOwner')
    owner = db.relationship('Admin')
    __table_args__ = (db.UniqueConstraint('super_owner_id', 'owner_id', name='_superowner_owner_uc'),)

class PembayaranSupplier(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('supplier.id'), nullable=False)
    tanggal_pembayaran = db.Column(db.Date, nullable=False, default=datetime.date.today)
    jumlah_pembayaran = db.Column(db.Float, nullable=False)
    metode_pembayaran = db.Column(db.String(20), nullable=False) 
    supplier = db.relationship('Supplier')

# (Letakkan ini setelah kelas 'PembayaranSupplier')

class Notifikasi(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    lapak_id = db.Column(db.Integer, db.ForeignKey('lapak.id'), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('supplier.id'), nullable=False)
    waktu_dikirim = db.Column(db.DateTime, server_default=func.now())
    status = db.Column(db.String(20), default='baru', nullable=False) # Status: 'baru' atau 'dibaca'

    # Relasi untuk memudahkan pengambilan data
    product = db.relationship('Product')
    lapak = db.relationship('Lapak')
    supplier = db.relationship('Supplier')
    
# (Letakkan ini setelah kelas 'Notifikasi')

# (Sekitar baris 224 di app.py)
class RiwayatPenarikanSuperOwner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    super_owner_id = db.Column(db.Integer, db.ForeignKey('super_owner.id'), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('admin.id'), nullable=True) # <-- TAMBAHKAN INI
    jumlah_penarikan = db.Column(db.Float, nullable=False)
    tanggal_penarikan = db.Column(db.DateTime, server_default=func.now())

    super_owner = db.relationship('SuperOwner')
    owner = db.relationship('Admin') # <-- TAMBAHKAN INI

# ===================================================================
# CLI & Rute Halaman
# ===================================================================
@app.cli.command("init-db")
def init_db_command():
    db.create_all()
    print("Database telah diinisialisasi.")

@app.cli.command("seed-db")
def seed_db_command():
    """Menghapus database dan hanya membuat 1 akun SuperOwner."""
    db.drop_all()
    db.create_all()
    print("Database dibersihkan dan struktur tabel baru dibuat...")

    try:
        # 1. Buat SuperOwner Saja
        super_owner = SuperOwner(
            username="cinda", 
            password="cinda", 
            nama_lengkap="Pemilik UMKM Cinda",
            email="superowner@example.com",
            nomor_kontak="08123456789"
        )
        db.session.add(super_owner)
        
        # 2. Commit perubahan
        db.session.commit()
        
        owner = Admin(
          nama_lengkap="Owner Satu",
          username="osatu",
          email="owner@example.com",
          password="osatu",
          nomor_kontak="08129876543",
          super_owner_id=super_owner.id
        )
        db.session.add(owner)
        db.session.commit()
        
        supplier = Supplier(
          nama_supplier="Supplier Satu",
          username="ssatu",
          kontak="08121212121",
          nomor_register="REG001",
          alamat="Jl. Supplier No.1",
          password="ssatu",
          metode_pembayaran="BCA",
          nomor_rekening="483271",
          owner_id=owner.id
        )
        #inisialisasi saldo supplier awal
        supplier.balance = SupplierBalance(balance=0.0)
        db.session.add(supplier)
        db.session.commit()
        
        # 4. Buat Produk (Dari Supplier)
        prod1 = Product(
            nama_produk="Kopi Bubuk Arabica",
            supplier_id=supplier.id,
            harga_beli=15000,
            harga_jual=25000,
            is_manual=False
        )
        prod2 = Product(
            nama_produk="Susu Kental Manis",
            supplier_id=supplier.id,
            harga_beli=10000,
            harga_jual=12000,
            is_manual=False
        )
        db.session.add_all([prod1, prod2])
        
        # 5. Buat Admin Lapak / Penanggung Jawab (Bawahan Owner)
        admin_lapak = Admin(
            nama_lengkap="Si Penjaga Lapak",
            username="lasatu",
            email="lapak@example.com",
            nomor_kontak="08444444444",
            password="lasatu",
            created_by_owner_id=owner.id # Relasi ke Owner
        )
        db.session.add(admin_lapak)
        db.session.commit()
        
        # 6. Buat Lapak
        lapak = Lapak(
            lokasi="Lapak Pusat - Jakarta",
            user_id=admin_lapak.id, # PJ-nya si admin_lapak
            owner_id=owner.id
        )
        # Masukkan produk ke lapak ini
        lapak.products.append(prod1)
        lapak.products.append(prod2)
        
        db.session.add(lapak)
        db.session.commit()
        
        print("\n=== SEED DATA BERHASIL ===")
        print("Gunakan akun berikut untuk login:")
        print("-------------------------------------------------")
        print("1. SUPEROWNER -> User: cinda    | Pass: cinda")
        print("2. OWNER      -> User: osatu    | Pass: osatu")
        print("3. SUPPLIER   -> User: ssatu    | Pass: ssatu")
        print("4. LAPAK (PJ) -> User: lasatu   | Pass: lasatu")
        print("-------------------------------------------------")

    except Exception as e:
        db.session.rollback()
        print(f"\nTERJADI ERROR SAAT SEEDING DATABASE: {e}")
    finally:
        db.session.close()
            
@app.route('/')
def login_page():
    return render_template('index.html')
  
# ===================================================================
# ENDPOINTS API
# ===================================================================
@app.route('/api/login', methods=['POST'])
def handle_login():
    data = request.json
    username = data.get('username', '').lower()
    password = data.get('password')
    admins = Admin.query.filter(db.func.lower(Admin.username) == username).all()
    
    admin_found = None
    for admin in admins:
        if admin.password == password:
            admin_found = admin
            break
            
    if admin_found:
        if admin_found.super_owner_id:
            return jsonify({"success": True, "role": "owner", "user_info": {"nama_lengkap": admin_found.nama_lengkap, "id": admin_found.id}})
        else:
            lapak_info = Lapak.query.filter_by(user_id=admin_found.id).first()
            if not lapak_info:
                lapak_info = Lapak.query.filter(Lapak.anggota.any(id=admin_found.id)).first()
            
            return jsonify({"success": True, "role": "lapak", "user_info": {"nama_lengkap": admin_found.nama_lengkap, "lapak_id": lapak_info.id if lapak_info else None, "id": admin_found.id}})
    
    # Cek Supplier
    supplier = Supplier.query.filter(db.func.lower(Supplier.username) == username).first()
    if supplier and supplier.password == password:
        return jsonify({"success": True, "role": "supplier", "user_info": {"nama_supplier": supplier.nama_supplier,"supplier_id": supplier.id}})
      
    # Cek Superowner
    superowner = SuperOwner.query.filter(db.func.lower(SuperOwner.username) == username).first()
    if superowner and superowner.password == password:
        return jsonify({"success": True, "role": "superowner", "user_info": {"username": superowner.username, "id": superowner.id}})
        
    return jsonify({"success": False, "message": "Username atau password salah"}), 401
  
# --- OWNER API ---

@app.route('/api/get_data_owner/<int:owner_id>', methods=['GET'])
def get_owner_data(owner_id):
    try:
        # Bagian ini (mengambil admin, lapak, supplier) sudah benar
        admins = Admin.query.filter(
            Admin.created_by_owner_id == owner_id,
            Admin.super_owner_id.is_(None)
        ).all()
        lapaks = Lapak.query.options(
            joinedload(Lapak.penanggung_jawab), 
            joinedload(Lapak.anggota)
        ).filter_by(owner_id=owner_id).all()
        suppliers = Supplier.query.filter_by(owner_id=owner_id).all()

        admin_list = [{"id": u.id, "nama_lengkap": u.nama_lengkap, "username": u.username, "email": u.email, "nomor_kontak": u.nomor_kontak, "password": u.password} for u in admins]
        lapak_list = [{"id": l.id, "lokasi": l.lokasi, "penanggung_jawab": f"{l.penanggung_jawab.nama_lengkap}", "user_id": l.user_id, "anggota": [{"id": a.id, "nama": a.nama_lengkap} for a in l.anggota], "anggota_ids": [a.id for a in l.anggota]} for l in lapaks]
        supplier_list = []
        for s in suppliers:
            supplier_list.append({
                "id": s.id, "nama_supplier": s.nama_supplier, "username": s.username, "kontak": s.kontak,
                "nomor_register": s.nomor_register, "alamat": s.alamat, "password": s.password,
                "metode_pembayaran": s.metode_pembayaran, "nomor_rekening": s.nomor_rekening
            })

        # === PERBAIKAN KPI DIMULAI DI SINI ===
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        
        lapak_ids = [l.id for l in lapaks] 

        total_pendapatan_bulan_ini = 0
        total_biaya_bulan_ini = 0
        profit_owner_bulan_ini = 0
        profit_superowner_bulan_ini = 0

        if lapak_ids:
            kpi_data = db.session.query(
                func.sum(LaporanHarian.total_pendapatan).label('total_pendapatan'),
                func.sum(LaporanHarian.total_biaya_supplier).label('total_biaya'),
                func.sum(LaporanHarian.keuntungan_owner).label('total_profit_owner'),
                func.sum(LaporanHarian.keuntungan_superowner).label('total_profit_superowner')
            ).filter(
                LaporanHarian.lapak_id.in_(lapak_ids),
                
                # --- INI ADALAH PERBAIKANNYA ---
                # Ubah dari '==' menjadi '.in_()'
                LaporanHarian.status.in_(['Terkonfirmasi', 'Difinalisasi']),
                # ------------------------------
                
                LaporanHarian.tanggal >= start_of_month,
                LaporanHarian.tanggal <= today
            ).first()

            if kpi_data:
                total_pendapatan_bulan_ini = kpi_data.total_pendapatan or 0
                total_biaya_bulan_ini = kpi_data.total_biaya or 0
                profit_owner_bulan_ini = kpi_data.total_profit_owner or 0
                profit_superowner_bulan_ini = kpi_data.total_profit_superowner or 0
        # === AKHIR PERBAIKAN KPI ===

        summary_data = {
            "pendapatan_bulan_ini": total_pendapatan_bulan_ini,
            "biaya_bulan_ini": total_biaya_bulan_ini,
            "profit_owner_bulan_ini": profit_owner_bulan_ini,
            "profit_superowner_bulan_ini": profit_superowner_bulan_ini
        }

        return jsonify({"admin_data": admin_list, "lapak_data": lapak_list, "supplier_data": supplier_list, "summary": summary_data})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting owner data: {str(e)}")
        return jsonify({"success": False, "message": f"Terjadi kesalahan server: {str(e)}"}), 500

# GANTI FUNGSI LAMA DENGAN VERSI BARU INI
@app.route('/api/get_owner_verification_reports/<int:owner_id>', methods=['GET'])
def get_owner_verification_reports(owner_id):
    try:
        # === LOGIKA BARU ===
        # Ambil semua laporan dari lapak yang 'owner_id'-nya cocok
        reports = LaporanHarian.query.join(Lapak).filter(
            Lapak.owner_id == owner_id,
            LaporanHarian.status == 'Terkonfirmasi' # <-- INI LOGIKA BARU (Sudah dikonfirmasi)
        ).options(
            joinedload(LaporanHarian.lapak)
        ).order_by(LaporanHarian.tanggal.desc()).all()

        report_list = [{
            "id": r.id,
            "tanggal": r.tanggal.strftime('%d %B %Y'),
            "lokasi": r.lapak.lokasi,
            "total_pendapatan": r.total_pendapatan,
            "total_produk_terjual": r.total_produk_terjual
        } for r in reports]

        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting verification reports: {str(e)}")
        return jsonify({"success": False, "message": "Gagal mengambil data verifikasi laporan."}), 500
      
# GANTI FUNGSI LAMA DENGAN VERSI BARU INI
@app.route('/api/add_admin', methods=['POST'])
def add_admin():
    data = request.json
    if data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password dan konfirmasi password tidak cocok."}), 400
    try:
        new_admin = Admin(
            nama_lengkap=data['nama_lengkap'],
            username=data['username'], 
            email=data['email'], 
            nomor_kontak=data['nomor_kontak'], 
            password=data['password'],
            # PERUBAHAN DI SINI: Terima super_owner_id jika ada
            super_owner_id=data.get('super_owner_id'),
            created_by_owner_id=data.get('created_by_owner_id'),
        )
        db.session.add(new_admin)
        db.session.commit()
        return jsonify({"success": True, "message": "Admin/Owner berhasil ditambahkan"})
    except IntegrityError as e:
        db.session.rollback()
        err_msg = str(e.orig).lower()
        message = "Gagal: Terjadi duplikasi data."
        if '_owner_nik_uc' in err_msg or 'admin.nik' in err_msg:
            message = "Gagal: NIK ini sudah terdaftar untuk admin lain di bawah Anda."
        elif '_owner_username_uc' in err_msg or 'admin.username' in err_msg:
            message = "Gagal: Username ini sudah terdaftar untuk admin lain di bawah Anda."
        elif '_owner_email_uc' in err_msg or 'admin.email' in err_msg:
            message = "Gagal: Email ini sudah terdaftar untuk admin lain di bawah Anda."
        return jsonify({"success": False, "message": message}), 400

@app.route('/api/update_admin/<int:admin_id>', methods=['PUT'])
def update_admin(admin_id):
    data = request.json
    admin = Admin.query.get_or_404(admin_id)
    if data.get('password') and data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password dan konfirmasi password tidak cocok."}), 400
    try:
        admin.nama_lengkap = data['nama_lengkap']
        admin.username = data['username']
        admin.email = data['email']
        admin.nomor_kontak = data['nomor_kontak']
        if data.get('password'): admin.password = data['password']
        db.session.commit()
        return jsonify({"success": True, "message": "Data Admin berhasil diperbarui"})
    except IntegrityError as e:
        db.session.rollback()
        err_msg = str(e.orig).lower()
        message = "Gagal: Terjadi duplikasi data."
        if '_owner_nik_uc' in err_msg or 'admin.nik' in err_msg:
            message = "Gagal: NIK ini sudah terdaftar untuk admin lain di bawah Anda."
        elif '_owner_username_uc' in err_msg or 'admin.username' in err_msg:
            message = "Gagal: Username ini sudah terdaftar untuk admin lain di bawah Anda."
        elif '_owner_email_uc' in err_msg or 'admin.email' in err_msg:
            message = "Gagal: Email ini sudah terdaftar untuk admin lain di bawah Anda."
        return jsonify({"success": False, "message": message}), 400

@app.route('/api/delete_admin/<int:admin_id>', methods=['DELETE'])
def delete_admin(admin_id):
    admin = Admin.query.get_or_404(admin_id)
    if Lapak.query.filter_by(user_id=admin_id).first(): return jsonify({"success": False, "message": "Gagal menghapus: Admin ini adalah Penanggung Jawab sebuah lapak."}), 400
    db.session.delete(admin)
    db.session.commit()
    return jsonify({"success": True, "message": "Admin berhasil dihapus"})

@app.route('/api/add_lapak', methods=['POST'])
def add_lapak():
    data = request.json
    try:
        new_lapak = Lapak(lokasi=data['lokasi'], user_id=data['user_id'], owner_id=data['owner_id'])
        anggota_ids = data.get('anggota_ids', [])
        if anggota_ids: new_lapak.anggota = Admin.query.filter(Admin.id.in_(anggota_ids)).all()
        db.session.add(new_lapak)
        db.session.commit()
        return jsonify({"success": True, "message": "Lapak berhasil ditambahkan"})
    except IntegrityError as e:
        db.session.rollback()
        message = "Gagal: Nama lokasi lapak sudah Anda gunakan."
        if '_owner_lapak_lokasi_uc' not in str(e.orig).lower():
            message = "Gagal: Terjadi kesalahan database."
        return jsonify({"success": False, "message": message}), 400

@app.route('/api/update_lapak/<int:lapak_id>', methods=['PUT'])
def update_lapak(lapak_id):
    data = request.json
    lapak = Lapak.query.get_or_404(lapak_id)
    try:
        lapak.lokasi = data['lokasi']
        lapak.user_id = data['user_id']
        anggota_ids = data.get('anggota_ids', [])
        lapak.anggota = Admin.query.filter(Admin.id.in_(anggota_ids)).all()
        db.session.commit()
        return jsonify({"success": True, "message": "Data Lapak berhasil diperbarui"})
    except IntegrityError as e:
        db.session.rollback()
        message = "Gagal: Nama lokasi lapak sudah Anda gunakan."
        if '_owner_lapak_lokasi_uc' not in str(e.orig).lower():
            message = "Gagal: Terjadi kesalahan database."
        return jsonify({"success": False, "message": message}), 400

@app.route('/api/delete_lapak/<int:lapak_id>', methods=['DELETE'])
def delete_lapak(lapak_id):
    lapak = Lapak.query.get_or_404(lapak_id)
    db.session.delete(lapak)
    db.session.commit()
    return jsonify({"success": True, "message": "Lapak berhasil dihapus"})

@app.route('/api/get_next_supplier_reg_number/<int:owner_id>', methods=['GET'])
def get_next_supplier_reg_number(owner_id):
    # 1. Ambil hanya supplier milik owner ini
    suppliers = Supplier.query.filter_by(owner_id=owner_id).all()
    
    used_numbers = set()
    for s in suppliers:
        # 2. PERBAIKAN REGEX: 
        # Hanya ambil angka jika formatnya persis "REG" diikuti angka (misal: REG001).
        # Ini akan mengabaikan seed data lama yg formatnya "REGA-..." atau "REGB-..." 
        # sehingga urutan jadi bersih kembali mulai dari 1.
        match = re.match(r'^REG(\d+)$', s.nomor_register)
        if match:
            used_numbers.add(int(match.group(1)))
    
    # 3. Cari angka terkecil yang belum dipakai
    next_id = 1
    while next_id in used_numbers:
        next_id += 1
        
    return jsonify({"success": True, "reg_number": f"REG{next_id:03d}"})
  
@app.route('/api/add_supplier', methods=['POST'])
def add_supplier():
    data = request.json
    if data['password'] != data['password_confirm']:
        return jsonify({"success": False, "message": "Password dan konfirmasi password tidak cocok."}), 400
    
    try:
        new_supplier = Supplier(
            nama_supplier=data['nama_supplier'],
            username=data.get('username'),
            kontak=data.get('kontak'),
            nomor_register=data.get('nomor_register'),
            alamat=data.get('alamat'),
            password=data['password'],
            metode_pembayaran=data.get('metode_pembayaran'),
            nomor_rekening=data.get('nomor_rekening'),
            owner_id=data.get('owner_id'),
        )
        new_supplier.balance = SupplierBalance(balance=0.0)
        db.session.add(new_supplier)
        db.session.commit()
        return jsonify({"success": True, "message": "Supplier berhasil ditambahkan"})
    except IntegrityError as e:
        db.session.rollback()
        err_msg = str(e.orig).lower()
        message = "Gagal: Terjadi duplikasi data."
        if '_owner_supplier_username_uc' in err_msg or 'supplier.username' in err_msg:
            message = "Gagal: Username ini sudah terdaftar untuk supplier lain di bawah Anda."
        elif '_owner_supplier_reg_uc' in err_msg or 'supplier.nomor_register' in err_msg:
            message = "Gagal: Nomor Register ini sudah terdaftar untuk supplier lain di bawah Anda."
        return jsonify({"success": False, "message": message}), 400
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error adding supplier: {str(e)}")
        return jsonify({"success": False, "message": f"Terjadi kesalahan server: {str(e)}"}), 500

# --- REVISI: Update metode pembayaran & no rekening ---
@app.route('/api/update_supplier/<int:supplier_id>', methods=['PUT'])
def update_supplier(supplier_id):
    data = request.json
    supplier = Supplier.query.get_or_404(supplier_id)

    if data.get('password') and data['password'] != data['password_confirm']:
        return jsonify({"success": False, "message": "Password dan konfirmasi password tidak cocok."}), 400

    try:
        supplier.nama_supplier = data['nama_supplier']
        supplier.username = data.get('username')
        supplier.kontak = data.get('kontak')
        supplier.alamat = data.get('alamat')
        supplier.metode_pembayaran = data.get('metode_pembayaran')
        supplier.nomor_rekening = data.get('nomor_rekening')
        if data.get('password'):
            supplier.password = data['password']
        
        db.session.commit()
        return jsonify({"success": True, "message": "Data Supplier berhasil diperbarui"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Username sudah digunakan oleh supplier lain."}), 400
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error updating supplier: {str(e)}")
        return jsonify({"success": False, "message": f"Terjadi kesalahan server: {str(e)}"}), 500

@app.route('/api/delete_supplier/<int:supplier_id>', methods=['DELETE'])
def delete_supplier(supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    db.session.delete(supplier)
    db.session.commit()
    return jsonify({"success": True, "message": "Supplier berhasil dihapus"})

@app.route('/api/get_owner_supplier_history/<int:supplier_id>', methods=['GET'])
def get_owner_supplier_history(supplier_id):
    try:
        # Ambil parameter tanggal dari request
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        # Query dasar untuk pembayaran
        payments_query = PembayaranSupplier.query.filter_by(supplier_id=supplier_id)
        
        # Query dasar untuk penjualan
        sales_query = db.session.query(
            LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk,
            LaporanHarianProduk.jumlah_terjual, LaporanHarianProduk.total_harga_beli
        ).select_from(LaporanHarianProduk)\
         .join(Product, Product.id == LaporanHarianProduk.product_id)\
         .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Lapak, Lapak.id == LaporanHarian.lapak_id)\
         .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Terkonfirmasi')

        # Terapkan filter tanggal jika ada
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran >= start_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal >= start_date)
        
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran <= end_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal <= end_date)

        # Eksekusi query setelah filter diterapkan
        payments = payments_query.order_by(PembayaranSupplier.tanggal_pembayaran.desc()).all()
        sales = sales_query.order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi).all()

        # Proses hasil
        payment_list = [{"tanggal": p.tanggal_pembayaran.strftime('%Y-%m-%d'), "jumlah": p.jumlah_pembayaran, "metode": p.metode_pembayaran} for p in payments]
        sales_list = [{"tanggal": s.tanggal.strftime('%Y-%m-%d'), "lokasi": s.lokasi, "nama_produk": s.nama_produk, "terjual": s.jumlah_terjual, "total_harga_beli": s.total_harga_beli} for s in sales]
        
        return jsonify({"success": True, "payments": payment_list, "sales": sales_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
# --- OWNER API (Laporan & Pembayaran) ---
# TAMBAHKAN DUA FUNGSI BARU INI DI app.py

@app.route('/api/get_laporan_pendapatan_harian')
def get_laporan_pendapatan_harian():
    try:
        date_str = request.args.get('date')
        target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()

        reports = LaporanHarian.query.options(
            joinedload(LaporanHarian.lapak),
            joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier)
        ).filter(
            LaporanHarian.tanggal == target_date,
            LaporanHarian.status == 'Terkonfirmasi'
        ).all()

        total_harian = sum(r.total_pendapatan for r in reports)
        laporan_per_lapak = []

        for report in reports:
            rincian_pendapatan = []
            for item in report.rincian_produk:
                if item.jumlah_terjual > 0:
                    rincian_pendapatan.append({
                        "produk": item.product.nama_produk,
                        "supplier": item.product.supplier.nama_supplier if item.product.supplier else "N/A",
                        "stok_awal": item.stok_awal,
                        "stok_akhir": item.stok_akhir,
                        "jumlah": item.jumlah_terjual
                    })
            
            if rincian_pendapatan:
                 laporan_per_lapak.append({
                    "lokasi": report.lapak.lokasi,
                    "penanggung_jawab": report.lapak.penanggung_jawab.nama_lengkap,
                    "total_pendapatan": report.total_pendapatan,
                    "rincian_pendapatan": rincian_pendapatan
                })

        return jsonify({
            "total_harian": total_harian,
            "laporan_per_lapak": laporan_per_lapak
        })

    except Exception as e:
        logging.error(f"Error fetching pendapatan harian: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/get_laporan_biaya_harian')
def get_laporan_biaya_harian():
    try:
        date_str = request.args.get('date')
        target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()

        reports = LaporanHarian.query.options(
            joinedload(LaporanHarian.lapak),
            joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier)
        ).filter(
            LaporanHarian.tanggal == target_date,
            LaporanHarian.status == 'Terkonfirmasi'
        ).all()

        total_harian = sum(r.total_biaya_supplier for r in reports)
        laporan_per_lapak = []

        for report in reports:
            rincian_biaya = []
            for item in report.rincian_produk:
                 if item.jumlah_terjual > 0:
                    rincian_biaya.append({
                        "produk": item.product.nama_produk,
                        "supplier": item.product.supplier.nama_supplier if item.product.supplier else "N/A",
                        "jumlah": item.jumlah_terjual,
                        "biaya": item.total_harga_beli
                    })
            
            if rincian_biaya:
                laporan_per_lapak.append({
                    "lokasi": report.lapak.lokasi,
                    "penanggung_jawab": report.lapak.penanggung_jawab.nama_lengkap,
                    "total_biaya": report.total_biaya_supplier,
                    "rincian_biaya": rincian_biaya
                })

        return jsonify({
            "total_harian": total_harian,
            "laporan_per_lapak": laporan_per_lapak
        })

    except Exception as e:
        logging.error(f"Error fetching biaya harian: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/get_manage_reports')
def get_manage_reports():
    try:
        # Ambil semua parameter dari request
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        supplier_id = request.args.get('supplier_id')
        status = request.args.get('status')
        owner_id = request.args.get('owner_id') # <-- 1. AMBIL OWNER ID

        # Query dasar untuk semua laporan
        query = LaporanHarian.query.options(
            joinedload(LaporanHarian.lapak).joinedload(Lapak.penanggung_jawab)
        )

        # === 2. TAMBAHKAN FILTER OWNER INI ===
        if owner_id:
            query = query.join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
                         .filter(Lapak.owner_id == owner_id)
        # === AKHIR FILTER OWNER ===

        # === LOGIKA BARU UNTUK STATUS ===
        if status:
            if status == 'semua':
                pass # Jangan filter apa-apa
            else:
                query = query.filter(LaporanHarian.status == status)
        else:
            # Jika TIDAK ada parameter status, default ke 'Menunggu Konfirmasi'
            query = query.filter(LaporanHarian.status == 'Menunggu Konfirmasi')
        # === AKHIR LOGIKA BARU ===

        # Terapkan filter tanggal jika ada
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            query = query.filter(LaporanHarian.tanggal >= start_date)
        
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            query = query.filter(LaporanHarian.tanggal <= end_date)
        
        if supplier_id:
            query = query.join(LaporanHarian.rincian_produk)\
                         .join(LaporanHarianProduk.product)\
                         .filter(Product.supplier_id == supplier_id)\
                         .distinct() 

        reports = query.order_by(LaporanHarian.tanggal.desc()).all()
        
        report_list = [{
            "id": r.id, 
            "lokasi": r.lapak.lokasi, 
            "penanggung_jawab": r.lapak.penanggung_jawab.nama_lengkap, 
            "tanggal": r.tanggal.isoformat(), 
            "total_pendapatan": r.total_pendapatan, 
            "total_produk_terjual": r.total_produk_terjual, 
            "status": r.status,
            "keuntungan_owner": r.keuntungan_owner, # Data baru
            "keuntungan_superowner": r.keuntungan_superowner # Data baru
        } for r in reports]
        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/confirm_report/<int:report_id>', methods=['POST'])
def confirm_report(report_id):
    try:
        # 1. Ambil owner_id yang sedang login (misal: Ata)
        data = request.json
        owner_id = data.get('owner_id')
        if not owner_id:
            return jsonify({"success": False, "message": "ID Owner tidak ditemukan."}), 400

        report = LaporanHarian.query.options(
            joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier).joinedload(Supplier.balance),
            joinedload(LaporanHarian.lapak)
        ).get(report_id)

        if not report: return jsonify({"success": False, "message": "Laporan tidak ditemukan."}), 404
        if report.status == 'Terkonfirmasi': return jsonify({"success": False, "message": "Laporan ini sudah dikonfirmasi."}), 400

        report.status = 'Terkonfirmasi'
        
        # Update saldo supplier (logika ini sudah benar)
        for rincian in report.rincian_produk:
            if rincian.product.supplier and rincian.product.supplier.balance:
                rincian.product.supplier.balance.balance += rincian.total_harga_beli
            
        # Hitung profit (logika ini sudah benar)
        total_profit = report.total_pendapatan - report.total_biaya_supplier
        keuntungan_superowner = total_profit * PROFIT_SHARE_SUPEROWNER_RATIO
        keuntungan_owner = total_profit * PROFIT_SHARE_OWNER_RATIO
        report.keuntungan_owner = keuntungan_owner
        report.keuntungan_superowner = keuntungan_superowner
        
        # 2. Ambil data 'managing_owner' (Ata) menggunakan owner_id
        managing_owner = Admin.query.get(owner_id) 
        
        if managing_owner and managing_owner.super_owner_id:
            super_owner_id = managing_owner.super_owner_id
            
            # 3. Cari SuperOwnerBalance yang cocok (milik Ata)
            so_balance = SuperOwnerBalance.query.filter_by(super_owner_id=super_owner_id, owner_id=managing_owner.id).first()
            if so_balance:
                # 4a. Tambahkan profit ke saldo Ata
                so_balance.balance += keuntungan_superowner
            else:
                # 4b. Buat saldo baru untuk Ata
                db.session.add(SuperOwnerBalance(super_owner_id=super_owner_id, owner_id=managing_owner.id, balance=keuntungan_superowner))

        db.session.commit()
        logging.info(f"-> LAPORAN #{report.id} DIKONFIRMASI OLEH OWNER #{owner_id}. Profit SuperOwner +{keuntungan_superowner}")
        return jsonify({"success": True, "message": "Laporan berhasil dikonfirmasi."})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error confirming report: {str(e)}")
        return jsonify({"success": False, "message": f"Terjadi kesalahan server: {str(e)}"}), 500
        
@app.route('/api/get_pembayaran_data', methods=['GET'])
def get_pembayaran_data():
    try:
        # === PERBAIKAN: Ambil owner_id dari request ===
        owner_id = request.args.get('owner_id')
        if not owner_id:
            return jsonify({"success": False, "message": "Owner ID tidak ditemukan."}), 400

        # === PERBAIKAN: Filter supplier berdasarkan owner_id ===
        suppliers = Supplier.query.filter_by(owner_id=owner_id).options(joinedload(Supplier.balance)).all()
        supplier_list = []
        
        for s in suppliers:
            tanggal_tagihan_masuk = None
            # Jika supplier punya tagihan (balance > 0)
            if s.balance and s.balance.balance > 0.01:
                # Cari tanggal laporan terkonfirmasi paling LAMA untuk supplier ini
                oldest_report_date = db.session.query(
                    func.min(LaporanHarian.tanggal)
                ).select_from(LaporanHarian).\
                  join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id).\
                  join(Product, LaporanHarianProduk.product_id == Product.id).\
                  filter(
                    Product.supplier_id == s.id,
                    LaporanHarian.status == 'Terkonfirmasi'
                  ).scalar()
                
                if oldest_report_date:
                    tanggal_tagihan_masuk = oldest_report_date.isoformat()

            supplier_list.append({
                "supplier_id": s.id, 
                "nama_supplier": s.nama_supplier, 
                "total_tagihan": s.balance.balance if s.balance else 0.0, 
                "metode_pembayaran": s.metode_pembayaran, 
                "nomor_rekening": s.nomor_rekening,
                "tanggal_masuk": tanggal_tagihan_masuk # <-- DATA BARU
            })
        
        return jsonify({
            "success": True, 
            "supplier_balances": supplier_list
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- REVISI: Hapus pemilihan metode, ambil dari data supplier ---
@app.route('/api/submit_pembayaran', methods=['POST'])
def submit_pembayaran():
    data = request.json
    supplier_id = data.get('supplier_id')
    jumlah_dibayar = float(data.get('jumlah_pembayaran', 0))
    supplier = Supplier.query.get(supplier_id)
    if not supplier or not supplier.metode_pembayaran:
        return jsonify({"success": False, "message": "Metode pembayaran untuk supplier ini belum diatur."}), 400
    balance = supplier.balance
    if not balance or balance.balance < (jumlah_dibayar - 0.01):
        return jsonify({"success": False, "message": f"Jumlah pembayaran melebihi total tagihan."}), 400
    try:
        new_payment = PembayaranSupplier(
            supplier_id=supplier_id, 
            jumlah_pembayaran=jumlah_dibayar, 
            metode_pembayaran=supplier.metode_pembayaran
        )
        db.session.add(new_payment)
        balance.balance -= jumlah_dibayar
        db.session.commit()
        return jsonify({"success": True, "message": f"Pembayaran berhasil dicatat."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": f"Terjadi kesalahan: {str(e)}"}), 500

# (Ganti fungsi lama di baris 1009 dengan ini)

@app.route('/api/get_all_payment_history', methods=['GET'])
def get_all_payment_history():
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        metode = request.args.get('metode')
        
        # === PERBAIKAN 1: Ambil owner_id ===
        owner_id = request.args.get('owner_id')
        if not owner_id:
            return jsonify({"success": False, "message": "Owner ID tidak ditemukan."}), 400

        start_date, end_date = None, None
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()

        all_history = []

        # === PERBAIKAN 2: Tambahkan JOIN dan FILTER owner_id ===
        payments_query = PembayaranSupplier.query.join(Supplier).filter(
            Supplier.owner_id == owner_id
        ).options(joinedload(PembayaranSupplier.supplier))
        if start_date:
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran >= start_date)
        if end_date:
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran <= end_date)
        if metode and metode != 'semua':
            payments_query = payments_query.filter(PembayaranSupplier.metode_pembayaran == metode)
        
        payments = payments_query.all()
        for p in payments:
            all_history.append({
                "tanggal": p.tanggal_pembayaran,
                "supplier_name": p.supplier.nama_supplier,
                "jumlah": p.jumlah_pembayaran,
                "metode": p.metode_pembayaran,
                "keterangan": "Tagihan Lunas",
                "tipe": "pembayaran" # Untuk styling di frontend
            })

        # 2. Ambil "Tagihan Masuk" (Laporan terkonfirmasi)
        # Filter 'metode' tidak berlaku di sini, karena ini adalah tagihan, bukan pembayaran
        tagihan_query = db.session.query(
            LaporanHarian.tanggal,
            Supplier.nama_supplier,
            func.sum(LaporanHarianProduk.total_harga_beli).label('total_biaya_harian')
        ).select_from(LaporanHarian).\
          join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id).\
          join(Product, LaporanHarianProduk.product_id == Product.id).\
          join(Supplier, Product.supplier_id == Supplier.id).\
          filter(LaporanHarian.status == 'Terkonfirmasi')

        # === PERBAIKAN 3: Tambahkan FILTER owner_id ===
        tagihan_query = tagihan_query.filter(Supplier.owner_id == owner_id)
        if start_date:
            tagihan_query = tagihan_query.filter(LaporanHarian.tanggal >= start_date)
        if end_date:
            tagihan_query = tagihan_query.filter(LaporanHarian.tanggal <= end_date)
        
        # Kelompokkan berdasarkan tanggal dan supplier
        tagihan_results = tagihan_query.group_by(
            LaporanHarian.tanggal, Supplier.nama_supplier
        ).having(
            func.sum(LaporanHarianProduk.total_harga_beli) > 0.01
        ).all()

        for t in tagihan_results:
            all_history.append({
                "tanggal": t.tanggal,
                "supplier_name": t.nama_supplier,
                "jumlah": t.total_biaya_harian,
                "metode": "-",
                "keterangan": "Tagihan Masuk",
                "tipe": "tagihan" # Untuk styling di frontend
            })
        
        # 3. Urutkan semua riwayat berdasarkan tanggal (terbaru dulu)
        all_history.sort(key=lambda x: x['tanggal'], reverse=True)
        
        # 4. Ubah format tanggal menjadi string setelah diurutkan
        history_list = [
            {**item, "tanggal": item['tanggal'].strftime('%Y-%m-%d')}
            for item in all_history
        ]
        
        return jsonify({"success": True, "history": history_list})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting combined payment history: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/api/get_chart_data', methods=['GET'])
def get_chart_data():
    try:
        year = int(request.args.get('year', datetime.date.today().year))
        month = int(request.args.get('month', datetime.date.today().month))

        # Tentukan jumlah hari dalam bulan yang dipilih
        _, num_days = monthrange(year, month)
        # Buat label untuk semua hari dalam bulan (misal: "1", "2", ..., "31")
        labels = [str(i) for i in range(1, num_days + 1)]
        
        # Inisialisasi data dengan 0 untuk setiap hari
        pendapatan_data = {day: 0 for day in labels}
        biaya_data = {day: 0 for day in labels}

        # 1. Ambil data pendapatan harian (dari laporan terkonfirmasi)
        pendapatan_results = db.session.query(
            func.extract('day', LaporanHarian.tanggal),
            func.sum(LaporanHarian.total_pendapatan)
        ).filter(
            func.extract('year', LaporanHarian.tanggal) == year,
            func.extract('month', LaporanHarian.tanggal) == month,
            LaporanHarian.status == 'Terkonfirmasi'
        ).group_by(func.extract('day', LaporanHarian.tanggal)).all()

        for day, total in pendapatan_results:
            pendapatan_data[str(int(day))] = total

        # 2. Ambil data biaya harian (dari pembayaran supplier)
        biaya_results = db.session.query(
            func.extract('day', PembayaranSupplier.tanggal_pembayaran),
            func.sum(PembayaranSupplier.jumlah_pembayaran)
        ).filter(
            func.extract('year', PembayaranSupplier.tanggal_pembayaran) == year,
            func.extract('month', PembayaranSupplier.tanggal_pembayaran) == month
        ).group_by(func.extract('day', PembayaranSupplier.tanggal_pembayaran)).all()
        
        for day, total in biaya_results:
            biaya_data[str(int(day))] = total
        
        return jsonify({
            "success": True,
            "labels": labels,
            "pendapatanData": list(pendapatan_data.values()),
            "biayaData": list(biaya_data.values())
        })

    except Exception as e:
        logging.error(f"Error getting chart data: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/finalize_reports', methods=['POST'])
def finalize_reports():
    data = request.json
    report_ids = data.get('report_ids', [])
    owner_id = data.get('owner_id') # Kita tetap ambil ID untuk logging

    if not report_ids or not owner_id:
        return jsonify({"success": False, "message": "Data tidak lengkap."}), 400

    try:
        # Ambil semua laporan yang akan difinalisasi
        reports_to_finalize = LaporanHarian.query.filter(
            LaporanHarian.id.in_(report_ids),
            LaporanHarian.status == 'Terkonfirmasi' # <-- PERBAIKAN 1: Periksa status yang benar
        ).all()

        if not reports_to_finalize:
            return jsonify({"success": False, "message": "Tidak ada laporan yang valid untuk difinalisasi."}), 400

        # Loop dan ubah statusnya
        for report in reports_to_finalize:
            report.status = 'Difinalisasi' # <-- PERBAIKAN 2: Set status baru (bukan 'Terkonfirmasi' lagi)

        # PERBAIKAN 3: Hapus semua logika perhitungan profit ganda
        
        db.session.commit()
        
        logging.info(f"-> FINALISASI BERHASIL: {len(reports_to_finalize)} laporan dari Owner #{owner_id} telah ditandai 'Difinalisasi'.")
        return jsonify({"success": True, "message": f"{len(reports_to_finalize)} laporan berhasil difinalisasi."})

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error during finalization: {str(e)}")
        return jsonify({"success": False, "message": "Terjadi kesalahan server saat finalisasi."}), 500
      
# Tambahkan di app.py

@app.route('/api/get_supplier_bill_breakdown/<int:supplier_id>', methods=['GET'])
def get_supplier_bill_breakdown(supplier_id):
    try:
        # Kita ambil data bulan ini sebagai konteks tagihan
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        
        # Query: Ambil tanggal, lokasi lapak, dan total biaya beli dari supplier tsb
        # Hanya dari laporan yang SUDAH DIKONFIRMASI (karena baru masuk tagihan setelah konfirm)
        query = db.session.query(
            LaporanHarian.tanggal,
            Lapak.lokasi,
            Admin.nama_lengkap.label('pj_name'),
            func.sum(LaporanHarianProduk.total_harga_beli).label('total_tagihan_harian')
        ).join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Product, LaporanHarianProduk.product_id == Product.id)\
         .join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
         .join(Admin, Lapak.user_id == Admin.id)\
         .filter(
             Product.supplier_id == supplier_id,
             LaporanHarian.status == 'Terkonfirmasi',
             LaporanHarian.tanggal >= start_of_month 
         )\
         .group_by(LaporanHarian.tanggal, Lapak.id) \
         .order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi)

        results = query.all()

        # Kita strukturkan datanya agar mudah ditampilkan:
        # { "2023-10-01": [ {lokasi: "Depok", total: 50000}, {lokasi: "Bogor", total: 20000} ] }
        breakdown = {}
        for r in results:
            tgl = r.tanggal.strftime('%Y-%m-%d')
            if tgl not in breakdown:
                breakdown[tgl] = {
                    "tanggal_formatted": r.tanggal.strftime('%d %B %Y'),
                    "items": [],
                    "total_hari_ini": 0
                }
            
            breakdown[tgl]["items"].append({
                "lokasi": r.lokasi,
                "pj": r.pj_name,
                "nominal": r.total_tagihan_harian
            })
            breakdown[tgl]["total_hari_ini"] += r.total_tagihan_harian

        # Ubah ke list agar urutan tanggal terjaga (terbaru diatas)
        final_list = []
        for tgl, data in breakdown.items():
            final_list.append(data)

        return jsonify({"success": True, "breakdown": final_list})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
      
# --- LAPAK API ---
@app.route('/api/get_data_buat_catatan/<int:lapak_id>', methods=['GET'])
def get_data_buat_catatan(lapak_id):
    today = datetime.date.today()
    # Pengecekan laporan yang sudah ada tetap berlaku
    if LaporanHarian.query.filter_by(lapak_id=lapak_id, tanggal=today).first():
        return jsonify({"success": False, "message": "Laporan untuk hari ini sudah dibuat.", "already_exists": True}), 409
    
    lapak = Lapak.query.get(lapak_id)
    if not lapak:
        return jsonify({"success": False, "message": "Lapak tidak ditemukan."}), 404
      
    # Ambil SEMUA supplier beserta produk mereka
    all_suppliers = Supplier.query.filter_by(owner_id=lapak.owner_id).options(joinedload(Supplier.products)).order_by(Supplier.nama_supplier).all()
    
    suppliers_data = []
    for s in all_suppliers:
        suppliers_data.append({
            "id": s.id,
            "name": s.nama_supplier,
            # === PERBAIKAN UTAMA ADA DI SINI ===
            "metode_pembayaran": s.metode_pembayaran, # Tambahkan baris ini
            # =====================================
            "products": [{
                "id": p.id,
                "name": p.nama_produk,
                "harga_jual": p.harga_jual,
                "harga_beli": p.harga_beli
            } for p in s.products]
        })
        
    return jsonify({"success": True, "data": suppliers_data})

@app.route('/api/submit_catatan_harian', methods=['POST'])
def submit_catatan_harian():
    data = request.json
    lapak_id = data.get('lapak_id')
    today = datetime.date.today()
    if LaporanHarian.query.filter_by(lapak_id=lapak_id, tanggal=today).first():
        return jsonify({"success": False, "message": "Laporan untuk hari ini sudah pernah dibuat."}), 400
    try:
        total_pendapatan_auto, total_biaya_auto, total_terjual_auto = 0.0, 0.0, 0
        
        new_report = LaporanHarian(lapak_id=lapak_id, tanggal=today, total_pendapatan=0, total_biaya_supplier=0,
            pendapatan_cash=float(data['rekap_pembayaran'].get('cash') or 0),
            pendapatan_qris=float(data['rekap_pembayaran'].get('qris') or 0),
            pendapatan_bca=float(data['rekap_pembayaran'].get('bca') or 0), total_produk_terjual=0,
            manual_pendapatan_cash=float(data['rekap_pembayaran'].get('cash') or 0),
            manual_pendapatan_qris=float(data['rekap_pembayaran'].get('qris') or 0),
            manual_pendapatan_bca=float(data['rekap_pembayaran'].get('bca') or 0),
            manual_total_pendapatan=float(data['rekap_pembayaran'].get('total') or 0)
        )
        db.session.add(new_report)
        db.session.flush()
        for prod_data in data.get('products', []):
            product_id = prod_data.get('id')
            stok_awal = int(prod_data.get('stok_awal') or 0)
            stok_akhir = int(prod_data.get('stok_akhir') or 0)
            if stok_awal == 0 and stok_akhir == 0: continue
            
            if not product_id:
                if prod_data.get('nama_produk'):
                    lapak = Lapak.query.get(lapak_id)
                    new_product = Product(nama_produk=prod_data['nama_produk'],
                        supplier_id=prod_data.get('supplier_id') if str(prod_data.get('supplier_id')).lower() != 'manual' else None,
                        harga_beli=HARGA_BELI_DEFAULT, harga_jual=HARGA_JUAL_DEFAULT, is_manual=True)
                    new_product.lapaks.append(lapak)
                    db.session.add(new_product)
                    db.session.flush()
                    product_id = new_product.id
                else: continue 

            product = Product.query.get(product_id)
            if not product: continue
            
            jumlah_terjual = max(0, stok_awal - stok_akhir)
            total_harga_jual = jumlah_terjual * product.harga_jual
            total_harga_beli = jumlah_terjual * product.harga_beli

            rincian = LaporanHarianProduk(laporan_id=new_report.id, product_id=product.id, stok_awal=stok_awal, stok_akhir=stok_akhir, jumlah_terjual=jumlah_terjual, total_harga_jual=total_harga_jual, total_harga_beli=total_harga_beli)
            db.session.add(rincian)
            db.session.add(StokHarian(lapak_id=lapak_id, product_id=product.id, jumlah_sisa=stok_akhir, tanggal=today))
            total_pendapatan_auto += total_harga_jual
            total_biaya_auto += total_harga_beli
            total_terjual_auto += jumlah_terjual
        
        new_report.total_pendapatan = total_pendapatan_auto
        new_report.total_biaya_supplier = total_biaya_auto
        new_report.total_produk_terjual = total_terjual_auto

        db.session.commit()
        return jsonify({"success": True, "message": "Laporan harian berhasil dikirim!"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": f"Gagal menyimpan laporan: {str(e)}"}), 500

@app.route('/api/get_history_laporan/<int:lapak_id>', methods=['GET'])
def get_history_laporan(lapak_id):
    try:
        reports = LaporanHarian.query.filter_by(lapak_id=lapak_id).order_by(LaporanHarian.tanggal.desc()).all()
        report_list = [{"id": r.id, "tanggal": r.tanggal.isoformat(), "total_pendapatan": r.total_pendapatan, "total_produk_terjual": r.total_produk_terjual, "status": r.status} for r in reports]
        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# Di app.py

@app.route('/api/add_manual_product_to_supplier', methods=['POST'])
def add_manual_product():
    data = request.json
    product_name = data.get('nama_produk')
    supplier_id = data.get('supplier_id')
    lapak_id = data.get('lapak_id')
    harga_jual_input = data.get('harga_jual')
    # --- TAMBAHAN BARU: Ambil harga beli ---
    harga_beli_input = data.get('harga_beli') 
    
    if not all([product_name, supplier_id, lapak_id, harga_jual_input, harga_beli_input]):
        return jsonify({"success": False, "message": "Data tidak lengkap (Nama, Supplier, Harga Jual, dan Harga Beli wajib diisi)."}), 400

    try:
        harga_jual = float(harga_jual_input)
        # --- TAMBAHAN BARU: Konversi harga beli ---
        harga_beli = float(harga_beli_input)
        
        existing_product = Product.query.filter_by(nama_produk=product_name, supplier_id=supplier_id).first()
        if existing_product:
            return jsonify({"success": False, "message": "Produk dengan nama ini sudah ada."}), 409

        new_product = Product(
            nama_produk=product_name,
            supplier_id=supplier_id,
            harga_beli=harga_beli, # <-- GUNAKAN INPUT USER, JANGAN DEFAULT
            harga_jual=harga_jual,
            is_manual=True
        )
        
        lapak = Lapak.query.get(lapak_id)
        if lapak:
            new_product.lapaks.append(lapak)

        db.session.add(new_product)
        db.session.commit()

        product_data = {
            "id": new_product.id,
            "name": new_product.nama_produk,
            "harga_jual": new_product.harga_jual,
            "harga_beli": new_product.harga_beli,
            "supplier_id": new_product.supplier_id
        }

        return jsonify({"success": True, "message": "Produk berhasil ditambahkan!", "product": product_data}), 201

    except ValueError:
         return jsonify({"success": False, "message": "Format harga tidak valid."}), 400
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error adding manual product: {str(e)}")
        return jsonify({"success": False, "message": "Terjadi kesalahan server."}), 500
      
# Di app.py (Tambahkan fungsi baru ini)

@app.route('/api/update_product_price/<int:product_id>', methods=['PUT'])
def update_product_price(product_id):
    data = request.json
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({"success": False, "message": "Produk tidak ditemukan."}), 404

        # Update harga jika dikirim
        if 'harga_beli' in data:
            product.harga_beli = float(data['harga_beli'])
        
        if 'harga_jual' in data:
            product.harga_jual = float(data['harga_jual'])
            
        if 'nama_produk' in data:
            product.nama_produk = data['nama_produk']

        db.session.commit()
        
        return jsonify({
            "success": True, 
            "message": "Produk berhasil diperbarui.",
            "product": {
                "id": product.id,
                "name": product.nama_produk,
                "harga_beli": product.harga_beli,
                "harga_jual": product.harga_jual,
                "supplier_id": product.supplier_id
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": f"Gagal update: {str(e)}"}), 500
            
@app.route('/api/notify_supplier', methods=['POST'])
def notify_supplier():
    data = request.json
    product_id = data.get('product_id')
    lapak_id = data.get('lapak_id')

    product = Product.query.get(product_id)
    lapak = Lapak.query.get(lapak_id)

    # Validasi input
    if not all([product, lapak]):
        return jsonify({"success": False, "message": "Data produk atau lapak tidak valid."}), 404
    
    # Pastikan produk memiliki supplier
    if not product.supplier_id:
        return jsonify({"success": False, "message": "Produk ini tidak terhubung ke supplier manapun."}), 400

    try:
        # Buat entri notifikasi baru di database
        notifikasi_baru = Notifikasi(
            product_id=product.id,
            lapak_id=lapak.id,
            supplier_id=product.supplier_id
        )
        db.session.add(notifikasi_baru)
        db.session.commit()

        # Cetak ke terminal (untuk debugging)
        logging.info(f"-> NOTIFIKASI TERSIMPAN: Stok produk '{product.nama_produk}' habis di '{lapak.lokasi}'.")

        return jsonify({"success": True, "message": "Notifikasi berhasil dikirim."})

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error saving notification: {str(e)}")
        return jsonify({"success": False, "message": "Terjadi kesalahan server saat menyimpan notifikasi."}), 500

# --- SUPPLIER API ---
# Cari dan GANTI fungsi get_data_supplier dengan yang ini
@app.route('/api/get_data_supplier/<int:supplier_id>', methods=['GET'])
def get_data_supplier(supplier_id):
    try:
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        
        # 1. Ambil Saldo Hutang Resmi (Yang sudah dikonfirmasi Owner)
        balance_info = SupplierBalance.query.filter_by(supplier_id=supplier_id).first()
        saldo_resmi = balance_info.balance if balance_info else 0.0
        
        # 2. Ambil Potensi Hutang (Laporan 'Menunggu Konfirmasi')
        # Ini agar angka langsung muncul saat Lapak kirim laporan
        potensi_hutang = db.session.query(
            func.sum(LaporanHarianProduk.total_harga_beli)
        ).join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Product, Product.id == LaporanHarianProduk.product_id)\
         .filter(
             Product.supplier_id == supplier_id,
             LaporanHarian.status == 'Menunggu Konfirmasi'
         ).scalar() or 0.0
         
        # Total yang ditampilkan di Dashboard
        total_tagihan_display = saldo_resmi + potensi_hutang

        # 3. Hitung Penjualan Bulan Ini (Hanya yang sudah approved/confirmed)
        penjualan_bulan_ini = db.session.query(
            func.sum(LaporanHarianProduk.total_harga_beli)
        ).join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Product, Product.id == LaporanHarianProduk.product_id)\
         .filter(
             Product.supplier_id == supplier_id, 
             LaporanHarian.tanggal >= start_of_month, 
             LaporanHarian.status == 'Terkonfirmasi'
         ).scalar() or 0

        return jsonify({
            "success": True, 
            "summary": {
                "total_tagihan": total_tagihan_display, 
                "penjualan_bulan_ini": penjualan_bulan_ini
            }
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/get_supplier_history/<int:supplier_id>', methods=['GET'])
def get_supplier_history(supplier_id):
    try:
        # Ambil semua parameter dari request
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        lapak_id = request.args.get('lapak_id') 

        # Query pembayaran (Tidak berubah)
        payments_query = PembayaranSupplier.query.filter_by(supplier_id=supplier_id)
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran >= start_date)
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran <= end_date)
        
        payments = payments_query.order_by(PembayaranSupplier.tanggal_pembayaran.desc()).all()
        payment_list = [{"tanggal": p.tanggal_pembayaran.strftime('%Y-%m-%d'), "jumlah": p.jumlah_pembayaran, "metode": p.metode_pembayaran} for p in payments]

        # --- PERBAIKAN DI SINI (Menambahkan total_harga_beli ke dalam Query) ---
        sales_query = db.session.query(
            LaporanHarian.tanggal, 
            Lapak.lokasi, 
            Product.nama_produk,
            LaporanHarianProduk.jumlah_terjual,
            LaporanHarianProduk.total_harga_beli # <--- DITAMBAHKAN AGAR TIDAK ERROR
        ).select_from(LaporanHarianProduk)\
         .join(Product, Product.id == LaporanHarianProduk.product_id)\
         .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Lapak, Lapak.id == LaporanHarian.lapak_id)\
         .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Terkonfirmasi')

        # Terapkan filter tanggal pada penjualan
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            sales_query = sales_query.filter(LaporanHarian.tanggal >= start_date)
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            sales_query = sales_query.filter(LaporanHarian.tanggal <= end_date)
        
        if lapak_id:
            sales_query = sales_query.filter(LaporanHarian.lapak_id == lapak_id)

        sales = sales_query.order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi).all()
        
        sales_list = [{
            "tanggal": s.tanggal.strftime('%Y-%m-%d'), 
            "lokasi": s.lokasi, 
            "nama_produk": s.nama_produk, 
            "terjual": s.jumlah_terjual,
            "nominal": s.total_harga_beli or 0 
        } for s in sales]
        
        # Filter Lapak Berdasarkan Owner dari Supplier
        current_supplier = Supplier.query.get(supplier_id)
        if not current_supplier:
             return jsonify({"success": False, "message": "Supplier tidak ditemukan"}), 404

        all_lapaks = Lapak.query.filter_by(owner_id=current_supplier.owner_id).order_by(Lapak.lokasi).all()
        
        lapak_list = [{"id": l.id, "lokasi": l.lokasi} for l in all_lapaks]
        
        return jsonify({"success": True, "payments": payment_list, "sales": sales_list, "lapaks": lapak_list})
      
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting supplier history: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
      
@app.route('/api/get_supplier_unpaid_details/<int:supplier_id>', methods=['GET'])
def get_supplier_unpaid_details(supplier_id):
    try:
        # Kita ambil laporan 'Terkonfirmasi' (Belum dibayar lunas secara sistem saldo)
        # DAN 'Menunggu Konfirmasi' (Baru dikirim lapak)
        
        # Catatan: Karena sistem menggunakan Running Balance (Saldo Mengendap), 
        # kita tampilkan laporan 30 hari terakhir sebagai representasi rincian tagihan.
        
        thirty_days_ago = datetime.date.today() - datetime.timedelta(days=30)

        query = db.session.query(
            LaporanHarian.tanggal,
            Lapak.lokasi,
            Product.nama_produk,
            LaporanHarian.status, # Kita ambil statusnya juga
            func.sum(LaporanHarianProduk.total_harga_beli).label('nominal')
        ).join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Product, LaporanHarianProduk.product_id == Product.id)\
         .join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
         .filter(
             Product.supplier_id == supplier_id,
             # Ambil status Terkonfirmasi ATAU Menunggu Konfirmasi
             LaporanHarian.status.in_(['Terkonfirmasi', 'Menunggu Konfirmasi']),
             LaporanHarian.tanggal >= thirty_days_ago 
         )\
         .group_by(LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk, LaporanHarian.status)\
         .order_by(LaporanHarian.tanggal.desc())

        results = query.all()

        details = []
        for r in results:
            if r.nominal > 0:
                details.append({
                    "tanggal": r.tanggal.isoformat(),
                    "lapak_name": r.lokasi,
                    "produk": r.nama_produk,
                    "status": r.status, # Kirim status ke frontend
                    "nominal": r.nominal
                })

        return jsonify({"success": True, "details": details})

    except Exception as e:
        logging.error(f"Error getting supplier unpaid details: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/get_supplier_notifications/<int:supplier_id>', methods=['GET'])
def get_supplier_notifications(supplier_id):
    try:
        # Ambil notifikasi yang belum diarsipkan, urutkan dari yang terbaru
        notifications = Notifikasi.query.filter(
            Notifikasi.supplier_id == supplier_id,
            Notifikasi.status != 'diarsipkan'
        ).order_by(Notifikasi.waktu_dikirim.desc()).all()

        notif_list = [{
            "id": n.id,
            "product_name": n.product.nama_produk,
            "lapak_name": n.lapak.lokasi,
            "time": n.waktu_dikirim.isoformat(),
            "status": n.status
        } for n in notifications]
        
        return jsonify({"success": True, "notifications": notif_list})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting supplier notifications: {str(e)}")
        return jsonify({"success": False, "message": "Gagal mengambil notifikasi."}), 500
      
# (Letakkan ini setelah fungsi get_supplier_notifications)

# Ganti fungsi lama dengan versi baru ini
@app.route('/api/update_notification_status/<int:notification_id>', methods=['POST'])
def update_notification_status(notification_id):
    data = request.json
    new_status = data.get('status')

    # PERUBAHAN DI SINI: Izinkan 'baru' sebagai status baru
    if new_status not in ['dibaca', 'diarsipkan', 'baru']:
        return jsonify({"success": False, "message": "Status tidak valid."}), 400

    try:
        # (Sisa dari fungsi ini tetap sama, tidak perlu diubah)
        notification = Notifikasi.query.get(notification_id)
        if not notification:
            return jsonify({"success": False, "message": "Notifikasi tidak ditemukan."}), 404

        notification.status = new_status
        db.session.commit()
        
        logging.info(f"-> STATUS NOTIFIKASI #{notification_id} diubah menjadi '{new_status}'.")
        return jsonify({"success": True, "message": f"Notifikasi ditandai sebagai {new_status}."})

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error updating notification status: {str(e)}")
        return jsonify({"success": False, "message": "Gagal memperbarui status notifikasi."}), 500

@app.route('/api/get_archived_notifications/<int:supplier_id>', methods=['GET'])
def get_archived_notifications(supplier_id):
    try:
        # Ambil hanya notifikasi yang statusnya 'diarsipkan'
        notifications = Notifikasi.query.filter_by(
            supplier_id=supplier_id,
            status='diarsipkan'
        ).order_by(Notifikasi.waktu_dikirim.desc()).all()

        notif_list = [{
            "id": n.id,
            "product_name": n.product.nama_produk,
            "lapak_name": n.lapak.lokasi,
            "time": n.waktu_dikirim.isoformat(),
        } for n in notifications]
        
        return jsonify({"success": True, "notifications": notif_list})
    except Exception as e:
        return jsonify({"success": False, "message": "Gagal mengambil arsip notifikasi."}), 500
      

# --- SUPEROWNER API ---

@app.route('/api/get_superowner_dashboard_data/<int:superowner_id>', methods=['GET'])
def get_superowner_dashboard_data(superowner_id):
    try:
        # 1. Ambil SEMUA owner dari tabel Admin
        all_owners = Admin.query.filter_by(super_owner_id=superowner_id).all()
        
        # 2. Ambil semua data saldo yang ada
        all_balances = SuperOwnerBalance.query.filter_by(super_owner_id=superowner_id).all()
        balance_map = {b.owner_id: b.balance for b in all_balances}

        # 3. Buat rincian tabel
        rincian_per_owner = []
        for owner in all_owners:
            current_balance = balance_map.get(owner.id, 0.0) 
            rincian_per_owner.append({
                "owner_id": owner.id, 
                "owner_name": owner.nama_lengkap, 
                "balance": current_balance # Ini adalah Saldo Saat Ini
            })
        
        total_saldo_profit = sum(b['balance'] for b in rincian_per_owner)

        # 4. Hitung "Profit Bulan Ini"
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        profit_bulan_ini = db.session.query(func.sum(LaporanHarian.keuntungan_superowner))\
            .join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
            .join(Admin, Lapak.owner_id == Admin.id)\
            .filter(
                Admin.super_owner_id == superowner_id,
                LaporanHarian.tanggal >= start_of_month,
                LaporanHarian.status.in_(['Terkonfirmasi', 'Difinalisasi'])
            ).scalar() or 0

        # 5. Hitung "Owner Terprofit"
        owner_terprofit = "Belum Ada" 
        
        if rincian_per_owner:
            # Cari Owner Terprofit berdasarkan 'balance' (Saldo Saat Ini) dari tabel
            top_owner = max(rincian_per_owner, key=lambda o: o['balance'])
            
            if top_owner['balance'] > 0:
                owner_terprofit = top_owner['owner_name']
        
        return jsonify({
            "success": True, 
            "total_saldo": total_saldo_profit, 
            "rincian_per_owner": rincian_per_owner,
            "kpi": { 
                "profit_bulan_ini": profit_bulan_ini, 
                "owner_terprofit": owner_terprofit 
            }
        })
    except Exception as e:
        db.session.rollback()
        # Baris ini yang mengirim error ke konsol Anda
        logging.error(f"Error getting SO dashboard data: {str(e)}")
        return jsonify({"success": False, "message": f"Gagal mengambil data dashboard: {str(e)}"}), 500


# (Ganti fungsi lama di baris 1540)
# (Ganti fungsi lama di baris 1540)
@app.route('/api/get_superowner_profit_details/<int:owner_id>', methods=['GET'])
def get_superowner_profit_details(owner_id):
    try:
        # Query ini mencari semua laporan terkonfirmasi yang menghasilkan profit
        profit_history = db.session.query(
            LaporanHarian.id, # <-- 1. TAMBAHKAN 'LaporanHarian.id' DI SINI
            LaporanHarian.tanggal,
            Lapak.lokasi,
            LaporanHarian.keuntungan_superowner
        ).join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
         .filter(
            LaporanHarian.status.in_(['Terkonfirmasi', 'Difinalisasi']),
            LaporanHarian.keuntungan_superowner > 0,
            Lapak.owner_id == owner_id 
        ).order_by(LaporanHarian.tanggal.desc()).all()

        history_list = [{
            "report_id": item.id, # <-- 2. SEKARANG 'item.id' BERISI DATA
            "tanggal": item.tanggal.strftime('%d %B %Y'),
            "sumber": f"Laporan dari {item.lokasi}",
            "profit": item.keuntungan_superowner
        } for item in profit_history]

        return jsonify({"success": True, "history": history_list})

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting superowner profit details: {str(e)}")
        return jsonify({"success": False, "message": "Gagal mengambil detail profit."}), 500
      
# (Tambahkan fungsi BARU ini di app.py, di bagian SUPEROWNER API)

@app.route('/api/get_superowner_report_profit_detail/<int:report_id>')
def get_superowner_report_profit_detail(report_id):
    try:
        report = LaporanHarian.query.options(
            joinedload(LaporanHarian.lapak)
        ).get(report_id)

        if not report:
            return jsonify({"success": False, "message": "Laporan tidak ditemukan"}), 404

        # Kirim data yang sudah disederhanakan
        data = {
            "id": report.id,
            "tanggal": report.tanggal.strftime('%d %B %Y'),
            "status": report.status,
            "lokasi": report.lapak.lokasi,
            "keuntungan_owner": report.keuntungan_owner,
            "keuntungan_superowner": report.keuntungan_superowner
        }
        return jsonify({"success": True, "data": data})

    except Exception as e:
        logging.error(f"Error getting SO profit detail: {str(e)}")
        return jsonify({"success": False, "message": "Terjadi kesalahan server"}), 500
# (Letakkan ini setelah fungsi 'get_superowner_profit_details')

@app.route('/api/superowner_withdraw', methods=['POST'])
def superowner_withdraw():
    data = request.json
    superowner_id = data.get('superowner_id')
    
    try:
        balances = SuperOwnerBalance.query.filter_by(super_owner_id=superowner_id).all()
        total_penarikan = sum(b.balance for b in balances)

        if total_penarikan <= 0:
            return jsonify({"success": False, "message": "Tidak ada saldo untuk ditarik."}), 400

        # Catat transaksi penarikan
        penarikan = RiwayatPenarikanSuperOwner(
            super_owner_id=superowner_id,
            jumlah_penarikan=total_penarikan
        )
        db.session.add(penarikan)

        # Reset saldo semua owner terkait menjadi 0
        for b in balances:
            b.balance = 0.0
        
        db.session.commit()
        logging.info(f"-> PENARIKAN BERHASIL: SuperOwner #{superowner_id} menarik saldo sebesar {total_penarikan}.")
        return jsonify({"success": True, "message": f"Penarikan saldo sebesar {total_penarikan:,.0f} berhasil dicatat."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal memproses penarikan."}), 500

# (Letakkan ini di dalam app.py, di bagian SUPEROWNER API)

@app.route('/api/superowner_withdraw_from_owner', methods=['POST'])
def superowner_withdraw_from_owner():
    data = request.json
    superowner_id = data.get('superowner_id')
    owner_id = data.get('owner_id') # ID owner yang saldonya ditarik

    if not superowner_id or not owner_id:
        return jsonify({"success": False, "message": "ID Superowner atau Owner tidak lengkap."}), 400

    try:
        # 1. Cari catatan saldo spesifik
        balance_record = SuperOwnerBalance.query.filter_by(
            super_owner_id=superowner_id,
            owner_id=owner_id
        ).first()

        if not balance_record or balance_record.balance <= 0:
            return jsonify({"success": False, "message": "Tidak ada saldo untuk ditarik."}), 400

        jumlah_penarikan = balance_record.balance

        # 2. Catat di riwayat, sekarang DENGAN owner_id
        penarikan = RiwayatPenarikanSuperOwner(
            super_owner_id=superowner_id,
            owner_id=owner_id, # <-- Ini bagian penting untuk pencatatan
            jumlah_penarikan=jumlah_penarikan
        )
        db.session.add(penarikan)

        # 3. Reset saldo owner tersebut menjadi 0
        balance_record.balance = 0.0
        
        db.session.commit()
        
        owner_name = Admin.query.get(owner_id).nama_lengkap
        logging.info(f"-> PENARIKAN (PENANDAAN) BERHASIL: Saldo dari {owner_name} (Rp {jumlah_penarikan}) telah di-nol-kan.")
        return jsonify({"success": True, "message": f"Saldo dari {owner_name} berhasil ditandai sebagai lunas."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal memproses penarikan."}), 500
      
# GANTI FUNGSI LAMA DENGAN VERSI BARU INI
@app.route('/api/get_superowner_profit_reports/<int:superowner_id>', methods=['GET'])
def get_superowner_profit_reports(superowner_id):
    try:
        # === LOGIKA BARU UNTUK MENGAMBIL LAPORAN ===
        # Query ini sekarang langsung mencari semua laporan yang menghasilkan profit untuk Superowner
        reports = db.session.query(
            LaporanHarian.id, LaporanHarian.tanggal, Lapak.lokasi,
            Admin.nama_lengkap.label('owner_name'), LaporanHarian.keuntungan_superowner
        ).join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
         .join(Admin, Lapak.user_id == Admin.id)\
         .filter(
            LaporanHarian.status == 'Terkonfirmasi',
            LaporanHarian.keuntungan_superowner > 0
        ).order_by(LaporanHarian.tanggal.desc()).all()
        # === AKHIR PERBAIKAN ===

        report_list = [{
            "report_id": r.id, "tanggal": r.tanggal.strftime('%d %B %Y'),
            "sumber": f"Laporan dari {r.lokasi}", "owner": r.owner_name, "profit": r.keuntungan_superowner
        } for r in reports]

        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": "Gagal mengambil laporan profit."}), 500

# (Letakkan ini setelah fungsi get_superowner_profit_reports)

# (Ganti fungsi lama di baris 1630 dengan ini)

# (Ganti fungsi lama di baris 1630)
@app.route('/api/get_superowner_transactions/<int:superowner_id>', methods=['GET'])
def get_superowner_transactions(superowner_id):
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        start_date, end_date = None, None
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()

        all_transactions = []

        # 1. Ambil "Profit Masuk" (Laporan terkonfirmasi)
        # Kita kelompokkan berdasarkan hari dan owner
        profit_query = db.session.query(
            LaporanHarian.tanggal,
            Admin.nama_lengkap.label('owner_name'),
            func.sum(LaporanHarian.keuntungan_superowner).label('total_profit')
        ).join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
         .join(Admin, Lapak.owner_id == Admin.id)\
         .filter(
            Admin.super_owner_id == superowner_id,
            LaporanHarian.status == 'Terkonfirmasi',
            LaporanHarian.keuntungan_superowner > 0
        )
        
        if start_date:
            profit_query = profit_query.filter(LaporanHarian.tanggal >= start_date)
        if end_date:
            profit_query = profit_query.filter(LaporanHarian.tanggal <= end_date)
            
        profit_results = profit_query.group_by(LaporanHarian.tanggal, Admin.nama_lengkap).all()

        for p in profit_results:
            all_transactions.append({
                "tanggal": p.tanggal,
                "keterangan": f"Profit dari {p.owner_name}",
                "tipe": "profit",
                "jumlah": p.total_profit
            })

        # 2. Ambil "Penarikan Keluar" (Penandaan Lunas)
        payout_query = RiwayatPenarikanSuperOwner.query.options(
            joinedload(RiwayatPenarikanSuperOwner.owner)
        ).filter(RiwayatPenarikanSuperOwner.super_owner_id == superowner_id)
        
        if start_date:
            # Riwayat penarikan menggunakan DateTime, jadi kita perlu konversi
            payout_query = payout_query.filter(func.date(RiwayatPenarikanSuperOwner.tanggal_penarikan) >= start_date)
        if end_date:
            payout_query = payout_query.filter(func.date(RiwayatPenarikanSuperOwner.tanggal_penarikan) <= end_date)
            
        payouts = payout_query.all()

        for h in payouts:
            all_transactions.append({
                "tanggal": h.tanggal_penarikan.date(), # Ambil tanggalnya saja untuk pengurutan
                "keterangan": f"Penarikan dari {h.owner.nama_lengkap if h.owner else 'Saldo Global'}",
                "tipe": "penarikan",
                "jumlah": -h.jumlah_penarikan # Buat jadi negatif
            })

        # 3. Urutkan semua transaksi berdasarkan tanggal (terbaru dulu)
        all_transactions.sort(key=lambda x: x['tanggal'], reverse=True)
        
        # 4. Ubah format tanggal menjadi string setelah diurutkan
        tx_list = [
            {**item, "tanggal": item['tanggal'].strftime('%Y-%m-%d')}
            for item in all_transactions
        ]

        return jsonify({"success": True, "transactions": tx_list})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting superowner transactions: {str(e)}")
        return jsonify({"success": False, "message": "Gagal mengambil riwayat transaksi."}), 500
            
@app.route('/api/get_superowner_owner_reports/<int:superowner_id>', methods=['GET'])
def get_superowner_owner_reports(superowner_id):
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        start_date, end_date = None, None
        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()

        owners = Admin.query.filter_by(super_owner_id=superowner_id).all()
        owner_reports = []
        
        for owner in owners:
            lapaks = Lapak.query.filter_by(owner_id=owner.id).all()
            lapak_ids = [l.id for l in lapaks]
            lapak_names = [l.lokasi for l in lapaks]

            if not lapak_ids:
                owner_reports.append({
                    "owner_id": owner.id, "owner_name": owner.nama_lengkap, "lapak_names": [],
                    "total_biaya_supplier": 0, "total_keuntungan_owner": 0, "total_keuntungan_superowner": 0
                })
                continue

            query = db.session.query(
                func.sum(LaporanHarian.total_biaya_supplier).label('total_biaya'),
                func.sum(LaporanHarian.keuntungan_owner).label('total_profit_owner'),
                func.sum(LaporanHarian.keuntungan_superowner).label('total_profit_superowner')
            ).filter(
                LaporanHarian.lapak_id.in_(lapak_ids),
                # === PERBAIKAN DI SINI ===
                # Ambil status 'Terkonfirmasi' DAN 'Difinalisasi'
                LaporanHarian.status.in_(['Terkonfirmasi', 'Difinalisasi']) 
            )
            
            if start_date:
                query = query.filter(LaporanHarian.tanggal >= start_date)
            if end_date:
                query = query.filter(LaporanHarian.tanggal <= end_date)

            aggregated_data = query.first()

            owner_reports.append({
                "owner_id": owner.id, "owner_name": owner.nama_lengkap, "lapak_names": lapak_names,
                "total_biaya_supplier": aggregated_data.total_biaya or 0,
                "total_keuntungan_owner": aggregated_data.total_profit_owner or 0,
                "total_keuntungan_superowner": aggregated_data.total_profit_superowner or 0
            })

        return jsonify({"success": True, "reports": owner_reports})

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error getting superowner aggregated reports: {str(e)}")
        return jsonify({"success": False, "message": "Gagal mengambil laporan agregat owner."}), 500
      
@app.route('/api/get_superowner_owners/<int:superowner_id>', methods=['GET'])
def get_superowner_owners(superowner_id):
    try:
        # Ambil semua admin yang terhubung ke superowner ini
        owners = Admin.query.filter_by(super_owner_id=superowner_id).all()
        owner_list = [{
            "id": o.id,
            "nama_lengkap": o.nama_lengkap,
            "username": o.username,
            "email": o.email,
            "nomor_kontak": o.nomor_kontak,
            "password": o.password
        } for o in owners]
        return jsonify({"success": True, "owners": owner_list})
    except Exception as e:
        return jsonify({"success": False, "message": "Gagal mengambil data owner."}), 500

@app.route('/api/get_report_details/<int:report_id>')
def get_report_details(report_id):
    try:
        # Load report beserta relasi ke supplier dan balance-nya
        report = LaporanHarian.query.options(
            joinedload(LaporanHarian.lapak).joinedload(Lapak.penanggung_jawab),
            joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier).joinedload(Supplier.balance)
        ).get(report_id)

        if not report:
            return jsonify({"success": False, "message": "Laporan tidak ditemukan"}), 404

        # --- LOGIKA BARU: Cek Kesehatan Hutang Supplier Terkait ---
        supplier_status = {}
        for item in report.rincian_produk:
            if item.product.supplier:
                sup_id = item.product.supplier.id
                sup_name = item.product.supplier.nama_supplier
                
                if sup_id not in supplier_status:
                    # 1. Ambil saldo hutang saat ini (Running Balance)
                    current_balance = item.product.supplier.balance.balance if item.product.supplier.balance else 0
                    
                    # 2. Cek kapan terakhir bayar
                    last_payment = PembayaranSupplier.query.filter_by(supplier_id=sup_id)\
                        .order_by(PembayaranSupplier.tanggal_pembayaran.desc()).first()
                    
                    last_pay_date = last_payment.tanggal_pembayaran.strftime('%d %B %Y') if last_payment else "Belum pernah"
                    
                    supplier_status[sup_name] = {
                        "total_hutang_saat_ini": current_balance,
                        "terakhir_dibayar": last_pay_date
                    }
        # -----------------------------------------------------------

        # Mengelompokkan produk berdasarkan supplier (Logika Lama)
        rincian_per_supplier = {}
        for item in report.rincian_produk:
            supplier_name = item.product.supplier.nama_supplier if item.product.supplier else "Produk Manual"
            
            if supplier_name not in rincian_per_supplier:
                rincian_per_supplier[supplier_name] = []
            
            rincian_per_supplier[supplier_name].append({
                "nama_produk": item.product.nama_produk,
                "stok_awal": item.stok_awal,
                "stok_akhir": item.stok_akhir,
                "terjual": item.jumlah_terjual,
                "harga_jual": item.product.harga_jual,
                "total_pendapatan": item.total_harga_jual,
            })

        data = {
            "id": report.id,
            "tanggal": report.tanggal.strftime('%d %B %Y'),
            "status": report.status,
            "lokasi": report.lapak.lokasi,
            "penanggung_jawab": report.lapak.penanggung_jawab.nama_lengkap,
            "rincian_per_supplier": rincian_per_supplier,
            "supplier_status": supplier_status, # <--- DATA BARU DIKIRIM KE SINI
            "rekap_otomatis": {
                "terjual_cash": report.pendapatan_cash,
                "terjual_qris": report.pendapatan_qris,
                "terjual_bca": report.pendapatan_bca,
                "total_produk_terjual": report.total_produk_terjual,
                "total_pendapatan": report.total_pendapatan,
                "total_biaya_supplier": report.total_biaya_supplier
            },
            "rekap_manual": {
                "terjual_cash": report.manual_pendapatan_cash,
                "terjual_qris": report.manual_pendapatan_qris,
                "terjual_bca": report.manual_pendapatan_bca,
                "total_produk_terjual": report.total_produk_terjual,
                "total_pendapatan": report.manual_total_pendapatan
            }
        }
        return jsonify({"success": True, "data": data})

    except Exception as e:
        logging.error(f"Error getting report details: {e}")
        return jsonify({"success": False, "message": "Terjadi kesalahan pada server"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)