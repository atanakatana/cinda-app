from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload
from sqlalchemy import desc
import datetime
import logging

from app.extensions import db
from app.models import (
    Lapak, Supplier, Product, LaporanHarian, LaporanHarianProduk, 
    StokHarian, Notifikasi,
    HARGA_BELI_DEFAULT, HARGA_JUAL_DEFAULT
)

lapak_bp = Blueprint('lapak', __name__)

@lapak_bp.route('/api/get_data_buat_catatan/<int:lapak_id>', methods=['GET'])
def get_data_buat_catatan(lapak_id):
    today = datetime.date.today()
    
    # Cek apakah sudah ada laporan hari ini
    existing_report = LaporanHarian.query.filter_by(lapak_id=lapak_id, tanggal=today).first()
    
    # Jika sudah ada laporan dan BUKAN status revisi, tolak akses (cegah double input)
    if existing_report and existing_report.status != 'Revisi':
        return jsonify({"success": False, "message": "Laporan hari ini sudah ada.", "already_exists": True}), 409
    
    lapak = Lapak.query.get(lapak_id)
    if not lapak: return jsonify({"success": False, "message": "Lapak tidak ditemukan."}), 404
      
    all_suppliers = Supplier.query.filter_by(owner_id=lapak.owner_id).options(joinedload(Supplier.products)).order_by(Supplier.nama_supplier).all()
    suppliers_data = []
    
    # Ambil catatan revisi jika ada
    catatan_revisi = existing_report.catatan_revisi if existing_report else None
    
    for s in all_suppliers:
        products_list = []
        for p in s.products:
            # [REVISI] Stok otomatis DIHAPUS karena produk harian (basi).
            # Stok awal dikosongkan (0) agar diisi manual oleh penjaga lapak.
            
            # Namun, jika statusnya sedang 'Revisi', kita mungkin ingin 
            # mengembalikan angka yang tadi sudah diisi user agar mereka tidak mengetik ulang dari nol.
            stok_awal_existing = 0
            stok_akhir_existing = 0
            
            if existing_report:
                # Cari data produk ini di laporan yang sedang direvisi
                rincian = next((r for r in existing_report.rincian_produk if r.product_id == p.id), None)
                if rincian:
                    stok_awal_existing = rincian.stok_awal
                    stok_akhir_existing = rincian.stok_akhir

            products_list.append({
                "id": p.id, 
                "name": p.nama_produk, 
                "harga_jual": p.harga_jual, 
                "harga_beli": p.harga_beli,
                # Kirim data existing jika revisi, jika baru kirim 0
                "stok_awal_value": stok_awal_existing,
                "stok_akhir_value": stok_akhir_existing
            })
            
        suppliers_data.append({
            "id": s.id, 
            "name": s.nama_supplier, 
            "metode_pembayaran": s.metode_pembayaran,
            "products": products_list
        })
        
    return jsonify({
        "success": True, 
        "data": suppliers_data, 
        "is_revision": (existing_report is not None),
        "catatan_revisi": catatan_revisi
    })

@lapak_bp.route('/api/submit_catatan_harian', methods=['POST'])
def submit_catatan_harian():
    data = request.json
    lapak_id = data.get('lapak_id')
    today = datetime.date.today()
    
    # Cek Laporan Eksisting
    existing_report = LaporanHarian.query.filter_by(lapak_id=lapak_id, tanggal=today).first()
    
    # Jika laporan ada dan statusnya BUKAN revisi, reject
    if existing_report and existing_report.status != 'Revisi':
        return jsonify({"success": False, "message": "Laporan sudah ada dan sedang diproses."}), 400

    try:
        # Jika REVISI, kita update laporan yang ada. Jika BARU, kita buat instance baru.
        if existing_report:
            report = existing_report
            report.status = 'Menunggu Konfirmasi' # Reset status ke Menunggu Konfirmasi
            report.catatan_revisi = None # Clear catatan revisi
            
            # Hapus rincian produk lama untuk diganti data baru yang diedit user
            for rincian in report.rincian_produk:
                db.session.delete(rincian)
            
            # Hapus stok harian hari ini juga untuk di-overwrite
            StokHarian.query.filter_by(lapak_id=lapak_id, tanggal=today).delete()
            
        else:
            report = LaporanHarian(lapak_id=lapak_id, tanggal=today)
            db.session.add(report)

        # Update Data Header Keuangan (Rekap)
        # Menggunakan float() untuk konversi, pastikan di model sudah Numeric(15,2)
        report.pendapatan_cash = float(data['rekap_pembayaran'].get('cash') or 0)
        report.pendapatan_qris = float(data['rekap_pembayaran'].get('qris') or 0)
        report.pendapatan_bca = float(data['rekap_pembayaran'].get('bca') or 0)
        
        report.manual_pendapatan_cash = float(data['rekap_pembayaran'].get('cash') or 0)
        report.manual_pendapatan_qris = float(data['rekap_pembayaran'].get('qris') or 0)
        report.manual_pendapatan_bca = float(data['rekap_pembayaran'].get('bca') or 0)
        report.manual_total_pendapatan = float(data['rekap_pembayaran'].get('total') or 0)

        db.session.flush() # Flush untuk mendapatkan ID laporan (jika baru)

        total_pendapatan_auto = 0.0
        total_biaya_auto = 0.0
        total_terjual_auto = 0
        
        for prod_data in data.get('products', []):
            product_id = prod_data.get('id')
            stok_awal = int(prod_data.get('stok_awal') or 0)
            stok_akhir = int(prod_data.get('stok_akhir') or 0)
            
            # Skip jika tidak ada aktivitas (0 stok awal, 0 stok akhir)
            if stok_awal == 0 and stok_akhir == 0: continue
            
            # Handling Manual Product (Produk dadakan yang belum ada di database)
            if not product_id:
                if prod_data.get('nama_produk'):
                    lapak = Lapak.query.get(lapak_id)
                    new_product = Product(
                        nama_produk=prod_data['nama_produk'],
                        # Jika supplier manual, set None
                        supplier_id=prod_data.get('supplier_id') if str(prod_data.get('supplier_id')).lower() != 'manual' else None,
                        harga_beli=float(prod_data.get('harga_beli') or 0),
                        harga_jual=float(prod_data.get('harga_jual') or 0), 
                        is_manual=True
                    )
                    new_product.lapaks.append(lapak)
                    db.session.add(new_product)
                    db.session.flush()
                    product_id = new_product.id
                else: continue 

            product = Product.query.get(product_id)
            
            # Hitung terjual (Stok Awal - Stok Akhir)
            # Karena basi, sisa stok akhir dianggap buang/retur (tidak dijual),
            # tapi hitungan penjualan tetap Awal - Akhir.
            jumlah_terjual = max(0, stok_awal - stok_akhir)
            
            total_harga_jual = jumlah_terjual * float(product.harga_jual)
            total_harga_beli = jumlah_terjual * float(product.harga_beli)

            rincian = LaporanHarianProduk(
                laporan_id=report.id, 
                product_id=product.id, 
                stok_awal=stok_awal, 
                stok_akhir=stok_akhir, 
                jumlah_terjual=jumlah_terjual, 
                total_harga_jual=total_harga_jual, 
                total_harga_beli=total_harga_beli
            )
            db.session.add(rincian)
            
            # Kita tetap catat StokHarian untuk arsip/history, 
            # meskipun besoknya tidak dipakai sebagai stok awal.
            db.session.add(StokHarian(lapak_id=lapak_id, product_id=product.id, jumlah_sisa=stok_akhir, tanggal=today))
            
            total_pendapatan_auto += total_harga_jual
            total_biaya_auto += total_harga_beli
            total_terjual_auto += jumlah_terjual
        
        report.total_pendapatan = total_pendapatan_auto
        report.total_biaya_supplier = total_biaya_auto
        report.total_produk_terjual = total_terjual_auto
        
        db.session.commit()
        return jsonify({"success": True, "message": "Laporan berhasil dikirim!"})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error submitting report: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@lapak_bp.route('/api/get_history_laporan/<int:lapak_id>', methods=['GET'])
def get_history_laporan(lapak_id):
    try:
        reports = LaporanHarian.query.filter_by(lapak_id=lapak_id).order_by(LaporanHarian.tanggal.desc()).all()
        return jsonify({"success": True, "reports": [{"id": r.id, "tanggal": r.tanggal.isoformat(), "total_pendapatan": r.total_pendapatan, "total_produk_terjual": r.total_produk_terjual, "status": r.status} for r in reports]})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@lapak_bp.route('/api/add_manual_product_to_supplier', methods=['POST'])
def add_manual_product():
    data = request.json
    try:
        new_product = Product(
            nama_produk=data.get('nama_produk'), supplier_id=data.get('supplier_id'),
            harga_beli=float(data.get('harga_beli')), harga_jual=float(data.get('harga_jual')), is_manual=True
        )
        lapak = Lapak.query.get(data.get('lapak_id'))
        if lapak: new_product.lapaks.append(lapak)
        db.session.add(new_product)
        db.session.commit()
        return jsonify({
          "success": True,
          "message": "Produk baru berhasil didaftarkan.",
          "product": {
            "id": new_product.id,
            "name": new_product.nama_produk,
            "supplier_id": new_product.supplier_id,
            "harga_beli": new_product.harga_beli,
            "harga_jual": new_product.harga_jual
          }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@lapak_bp.route('/api/update_product_price/<int:product_id>', methods=['PUT'])
def update_product_price(product_id):
    data = request.json
    try:
        product = Product.query.get(product_id)
        if not product: return jsonify({"success": False, "message": "Produk tidak ditemukan."}), 404
        if 'harga_beli' in data: product.harga_beli = float(data['harga_beli'])
        if 'harga_jual' in data: product.harga_jual = float(data['harga_jual'])
        if 'nama_produk' in data: product.nama_produk = data['nama_produk']
        db.session.commit()
        return jsonify({"success": True, "message": "Produk diperbarui."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@lapak_bp.route('/api/notify_supplier', methods=['POST'])
def notify_supplier():
    data = request.json
    try:
        product = Product.query.get(data.get('product_id'))
        lapak = Lapak.query.get(data.get('lapak_id'))
        if not product or not lapak or not product.supplier_id: return jsonify({"success": False}), 400
        
        db.session.add(Notifikasi(product_id=product.id, lapak_id=lapak.id, supplier_id=product.supplier_id))
        db.session.commit()
        return jsonify({"success": True, "message": "Notifikasi dikirim."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500