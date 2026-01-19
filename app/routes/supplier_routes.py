from flask import Blueprint, jsonify, request
from sqlalchemy import func
import datetime

from app.extensions import db
from app.models import (
    Supplier, SupplierBalance, LaporanHarian, LaporanHarianProduk, 
    Product, PembayaranSupplier, Lapak, Notifikasi
)

supplier_bp = Blueprint('supplier', __name__)

@supplier_bp.route('/api/get_data_supplier/<int:supplier_id>', methods=['GET'])
def get_data_supplier(supplier_id):
    try:
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        
        balance_info = SupplierBalance.query.filter_by(supplier_id=supplier_id).first()
        saldo_resmi = balance_info.balance if balance_info else 0.0
        
        potensi_hutang = db.session.query(func.sum(LaporanHarianProduk.total_harga_beli))\
            .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
            .join(Product, Product.id == LaporanHarianProduk.product_id)\
            .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Menunggu Konfirmasi').scalar() or 0.0
         
        penjualan_bulan_ini = db.session.query(func.sum(LaporanHarianProduk.total_harga_beli))\
            .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
            .join(Product, Product.id == LaporanHarianProduk.product_id)\
            .filter(Product.supplier_id == supplier_id, LaporanHarian.tanggal >= start_of_month, LaporanHarian.status == 'Terkonfirmasi').scalar() or 0

        return jsonify({"success": True, "summary": {"total_tagihan": saldo_resmi + potensi_hutang, "penjualan_bulan_ini": penjualan_bulan_ini}})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@supplier_bp.route('/api/get_supplier_history/<int:supplier_id>', methods=['GET'])
def get_supplier_history(supplier_id):
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        lapak_id = request.args.get('lapak_id') 

        payments_query = PembayaranSupplier.query.filter_by(supplier_id=supplier_id)
        sales_query = db.session.query(LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk, LaporanHarianProduk.jumlah_terjual, LaporanHarianProduk.total_harga_beli)\
            .select_from(LaporanHarianProduk).join(Product, Product.id == LaporanHarianProduk.product_id)\
            .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id).join(Lapak, Lapak.id == LaporanHarian.lapak_id)\
            .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Terkonfirmasi')

        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran >= start_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal >= start_date)
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran <= end_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal <= end_date)
        if lapak_id:
            sales_query = sales_query.filter(LaporanHarian.lapak_id == lapak_id)

        payments = payments_query.order_by(PembayaranSupplier.tanggal_pembayaran.desc()).all()
        sales = sales_query.order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi).all()
        
        current_supplier = Supplier.query.get(supplier_id)
        all_lapaks = Lapak.query.filter_by(owner_id=current_supplier.owner_id).order_by(Lapak.lokasi).all() if current_supplier else []
        
        return jsonify({
            "success": True, 
            "payments": [{"tanggal": p.tanggal_pembayaran.strftime('%Y-%m-%d'), "jumlah": p.jumlah_pembayaran, "metode": p.metode_pembayaran} for p in payments], 
            "sales": [{"tanggal": s.tanggal.strftime('%Y-%m-%d'), "lokasi": s.lokasi, "nama_produk": s.nama_produk, "terjual": s.jumlah_terjual, "nominal": s.total_harga_beli or 0} for s in sales], 
            "lapaks": [{"id": l.id, "lokasi": l.lokasi} for l in all_lapaks]
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@supplier_bp.route('/api/get_supplier_unpaid_details/<int:supplier_id>', methods=['GET'])
def get_supplier_unpaid_details(supplier_id):
    try:
        thirty_days_ago = datetime.date.today() - datetime.timedelta(days=30)
        results = db.session.query(LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk, LaporanHarian.status, func.sum(LaporanHarianProduk.total_harga_beli).label('nominal'))\
            .join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id).join(Product, LaporanHarianProduk.product_id == Product.id).join(Lapak, LaporanHarian.lapak_id == Lapak.id)\
            .filter(Product.supplier_id == supplier_id, LaporanHarian.status.in_(['Terkonfirmasi', 'Menunggu Konfirmasi']), LaporanHarian.tanggal >= thirty_days_ago)\
            .group_by(LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk, LaporanHarian.status).order_by(LaporanHarian.tanggal.desc()).all()

        return jsonify({"success": True, "details": [{"tanggal": r.tanggal.isoformat(), "lapak_name": r.lokasi, "produk": r.nama_produk, "status": r.status, "nominal": r.nominal} for r in results if r.nominal > 0]})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@supplier_bp.route('/api/get_supplier_notifications/<int:supplier_id>', methods=['GET'])
def get_supplier_notifications(supplier_id):
    try:
        notifications = Notifikasi.query.filter(Notifikasi.supplier_id == supplier_id, Notifikasi.status != 'diarsipkan').order_by(Notifikasi.waktu_dikirim.desc()).all()
        return jsonify({"success": True, "notifications": [{"id": n.id, "product_name": n.product.nama_produk, "lapak_name": n.lapak.lokasi, "time": n.waktu_dikirim.isoformat(), "status": n.status} for n in notifications]})
    except Exception as e:
        return jsonify({"success": False, "message": "Gagal mengambil notifikasi."}), 500

@supplier_bp.route('/api/update_notification_status/<int:notification_id>', methods=['POST'])
def update_notification_status(notification_id):
    try:
        notification = Notifikasi.query.get(notification_id)
        if not notification: return jsonify({"success": False}), 404
        notification.status = request.json.get('status')
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@supplier_bp.route('/api/get_archived_notifications/<int:supplier_id>', methods=['GET'])
def get_archived_notifications(supplier_id):
    try:
        notifications = Notifikasi.query.filter_by(supplier_id=supplier_id, status='diarsipkan').order_by(Notifikasi.waktu_dikirim.desc()).all()
        return jsonify({"success": True, "notifications": [{"id": n.id, "product_name": n.product.nama_produk, "lapak_name": n.lapak.lokasi, "time": n.waktu_dikirim.isoformat()} for n in notifications]})
    except Exception as e:
        return jsonify({"success": False}), 500