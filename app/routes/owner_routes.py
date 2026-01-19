from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError
import datetime
import re
from calendar import monthrange
import logging

from app.extensions import db
from app.models import (
    Admin, Lapak, Supplier, Product, LaporanHarian, LaporanHarianProduk, 
    SupplierBalance, SuperOwnerBalance, PembayaranSupplier, 
    PROFIT_SHARE_OWNER_RATIO, PROFIT_SHARE_SUPEROWNER_RATIO
)

owner_bp = Blueprint('owner', __name__)

# --- DASHBOARD & DATA UTAMA ---
@owner_bp.route('/api/get_data_owner/<int:owner_id>', methods=['GET'])
def get_owner_data(owner_id):
    try:
        admins = Admin.query.filter(Admin.created_by_owner_id == owner_id, Admin.super_owner_id.is_(None)).all()
        lapaks = Lapak.query.options(joinedload(Lapak.penanggung_jawab), joinedload(Lapak.anggota)).filter_by(owner_id=owner_id).all()
        suppliers = Supplier.query.filter_by(owner_id=owner_id).all()

        admin_list = [{"id": u.id, "nama_lengkap": u.nama_lengkap, "username": u.username, "email": u.email, "nomor_kontak": u.nomor_kontak, "password": u.password} for u in admins]
        lapak_list = [{"id": l.id, "lokasi": l.lokasi, "penanggung_jawab": f"{l.penanggung_jawab.nama_lengkap}", "user_id": l.user_id, "anggota": [{"id": a.id, "nama": a.nama_lengkap} for a in l.anggota], "anggota_ids": [a.id for a in l.anggota]} for l in lapaks]
        supplier_list = [{"id": s.id, "nama_supplier": s.nama_supplier, "username": s.username, "kontak": s.kontak, "nomor_register": s.nomor_register, "alamat": s.alamat, "password": s.password, "metode_pembayaran": s.metode_pembayaran, "nomor_rekening": s.nomor_rekening} for s in suppliers]

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
                LaporanHarian.status.in_(['Terkonfirmasi', 'Difinalisasi']),
                LaporanHarian.tanggal >= start_of_month,
                LaporanHarian.tanggal <= today
            ).first()

            if kpi_data:
                total_pendapatan_bulan_ini = kpi_data.total_pendapatan or 0
                total_biaya_bulan_ini = kpi_data.total_biaya or 0
                profit_owner_bulan_ini = kpi_data.total_profit_owner or 0
                profit_superowner_bulan_ini = kpi_data.total_profit_superowner or 0

        summary_data = {
            "pendapatan_bulan_ini": total_pendapatan_bulan_ini,
            "biaya_bulan_ini": total_biaya_bulan_ini,
            "profit_owner_bulan_ini": profit_owner_bulan_ini,
            "profit_superowner_bulan_ini": profit_superowner_bulan_ini
        }
        return jsonify({"admin_data": admin_list, "lapak_data": lapak_list, "supplier_data": supplier_list, "summary": summary_data})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": f"Terjadi kesalahan server: {str(e)}"}), 500

@owner_bp.route('/api/get_owner_verification_reports/<int:owner_id>', methods=['GET'])
def get_owner_verification_reports(owner_id):
    try:
        reports = LaporanHarian.query.join(Lapak).filter(
            Lapak.owner_id == owner_id,
            LaporanHarian.status == 'Terkonfirmasi'
        ).options(joinedload(LaporanHarian.lapak)).order_by(LaporanHarian.tanggal.desc()).all()

        report_list = [{
            "id": r.id,
            "tanggal": r.tanggal.strftime('%d %B %Y'),
            "lokasi": r.lapak.lokasi,
            "total_pendapatan": r.total_pendapatan,
            "total_produk_terjual": r.total_produk_terjual
        } for r in reports]
        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": "Gagal mengambil data verifikasi laporan."}), 500

# --- MANAJEMEN ADMIN & LAPAK ---
@owner_bp.route('/api/add_admin', methods=['POST'])
def add_admin():
    data = request.json
    if data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password tidak cocok."}), 400
    try:
        new_admin = Admin(
            nama_lengkap=data['nama_lengkap'], username=data['username'], email=data['email'], 
            nomor_kontak=data['nomor_kontak'], password=data['password'],
            super_owner_id=data.get('super_owner_id'), created_by_owner_id=data.get('created_by_owner_id')
        )
        db.session.add(new_admin)
        db.session.commit()
        return jsonify({"success": True, "message": "Admin berhasil ditambahkan"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Data duplikat."}), 400

@owner_bp.route('/api/update_admin/<int:admin_id>', methods=['PUT'])
def update_admin(admin_id):
    data = request.json
    admin = Admin.query.get_or_404(admin_id)
    if data.get('password') and data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password tidak cocok."}), 400
    try:
        admin.nama_lengkap = data['nama_lengkap']
        admin.username = data['username']
        admin.email = data['email']
        admin.nomor_kontak = data['nomor_kontak']
        if data.get('password'): admin.password = data['password']
        db.session.commit()
        return jsonify({"success": True, "message": "Data Admin diperbarui"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Data duplikat."}), 400

@owner_bp.route('/api/delete_admin/<int:admin_id>', methods=['DELETE'])
def delete_admin(admin_id):
    admin = Admin.query.get_or_404(admin_id)
    if Lapak.query.filter_by(user_id=admin_id).first(): return jsonify({"success": False, "message": "Gagal: Admin ini adalah PJ Lapak."}), 400
    db.session.delete(admin)
    db.session.commit()
    return jsonify({"success": True, "message": "Admin dihapus"})

@owner_bp.route('/api/add_lapak', methods=['POST'])
def add_lapak():
    data = request.json
    try:
        new_lapak = Lapak(lokasi=data['lokasi'], user_id=data['user_id'], owner_id=data['owner_id'])
        if data.get('anggota_ids'): new_lapak.anggota = Admin.query.filter(Admin.id.in_(data['anggota_ids'])).all()
        db.session.add(new_lapak)
        db.session.commit()
        return jsonify({"success": True, "message": "Lapak ditambahkan"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Lokasi sudah ada."}), 400

@owner_bp.route('/api/update_lapak/<int:lapak_id>', methods=['PUT'])
def update_lapak(lapak_id):
    data = request.json
    lapak = Lapak.query.get_or_404(lapak_id)
    try:
        lapak.lokasi = data['lokasi']
        lapak.user_id = data['user_id']
        lapak.anggota = Admin.query.filter(Admin.id.in_(data.get('anggota_ids', []))).all()
        db.session.commit()
        return jsonify({"success": True, "message": "Lapak diperbarui"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Lokasi sudah ada."}), 400

@owner_bp.route('/api/delete_lapak/<int:lapak_id>', methods=['DELETE'])
def delete_lapak(lapak_id):
    lapak = Lapak.query.get_or_404(lapak_id)
    db.session.delete(lapak)
    db.session.commit()
    return jsonify({"success": True, "message": "Lapak dihapus"})

# --- MANAJEMEN SUPPLIER ---
@owner_bp.route('/api/get_next_supplier_reg_number/<int:owner_id>', methods=['GET'])
def get_next_supplier_reg_number(owner_id):
    suppliers = Supplier.query.filter_by(owner_id=owner_id).all()
    used_numbers = set()
    for s in suppliers:
        match = re.match(r'^REG(\d+)$', s.nomor_register)
        if match: used_numbers.add(int(match.group(1)))
    next_id = 1
    while next_id in used_numbers: next_id += 1
    return jsonify({"success": True, "reg_number": f"REG{next_id:03d}"})

@owner_bp.route('/api/add_supplier', methods=['POST'])
def add_supplier():
    data = request.json
    if data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password tidak cocok."}), 400
    try:
        new_supplier = Supplier(
            nama_supplier=data['nama_supplier'], username=data.get('username'), kontak=data.get('kontak'),
            nomor_register=data.get('nomor_register'), alamat=data.get('alamat'), password=data['password'],
            metode_pembayaran=data.get('metode_pembayaran'), nomor_rekening=data.get('nomor_rekening'),
            owner_id=data.get('owner_id')
        )
        new_supplier.balance = SupplierBalance(balance=0.0)
        db.session.add(new_supplier)
        db.session.commit()
        return jsonify({"success": True, "message": "Supplier ditambahkan"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Data duplikat."}), 400

@owner_bp.route('/api/update_supplier/<int:supplier_id>', methods=['PUT'])
def update_supplier(supplier_id):
    data = request.json
    supplier = Supplier.query.get_or_404(supplier_id)
    if data.get('password') and data['password'] != data['password_confirm']: return jsonify({"success": False, "message": "Password tidak cocok."}), 400
    try:
        supplier.nama_supplier = data['nama_supplier']
        supplier.username = data.get('username')
        supplier.kontak = data.get('kontak')
        supplier.alamat = data.get('alamat')
        supplier.metode_pembayaran = data.get('metode_pembayaran')
        supplier.nomor_rekening = data.get('nomor_rekening')
        if data.get('password'): supplier.password = data['password']
        db.session.commit()
        return jsonify({"success": True, "message": "Data Supplier diperbarui"})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal: Username sudah ada."}), 400

@owner_bp.route('/api/delete_supplier/<int:supplier_id>', methods=['DELETE'])
def delete_supplier(supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    db.session.delete(supplier)
    db.session.commit()
    return jsonify({"success": True, "message": "Supplier dihapus"})

@owner_bp.route('/api/get_owner_supplier_history/<int:supplier_id>', methods=['GET'])
def get_owner_supplier_history(supplier_id):
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        payments_query = PembayaranSupplier.query.filter_by(supplier_id=supplier_id)
        sales_query = db.session.query(
            LaporanHarian.tanggal, Lapak.lokasi, Product.nama_produk,
            LaporanHarianProduk.jumlah_terjual, LaporanHarianProduk.total_harga_beli
        ).select_from(LaporanHarianProduk).join(Product, Product.id == LaporanHarianProduk.product_id)\
         .join(LaporanHarian, LaporanHarian.id == LaporanHarianProduk.laporan_id)\
         .join(Lapak, Lapak.id == LaporanHarian.lapak_id)\
         .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Terkonfirmasi')

        if start_date_str:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran >= start_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal >= start_date)
        if end_date_str:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
            payments_query = payments_query.filter(PembayaranSupplier.tanggal_pembayaran <= end_date)
            sales_query = sales_query.filter(LaporanHarian.tanggal <= end_date)

        payments = payments_query.order_by(PembayaranSupplier.tanggal_pembayaran.desc()).all()
        sales = sales_query.order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi).all()

        return jsonify({
            "success": True, 
            "payments": [{"tanggal": p.tanggal_pembayaran.strftime('%Y-%m-%d'), "jumlah": p.jumlah_pembayaran, "metode": p.metode_pembayaran} for p in payments],
            "sales": [{"tanggal": s.tanggal.strftime('%Y-%m-%d'), "lokasi": s.lokasi, "nama_produk": s.nama_produk, "terjual": s.jumlah_terjual, "total_harga_beli": s.total_harga_beli} for s in sales]
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- LAPORAN & KEUANGAN ---
@owner_bp.route('/api/get_manage_reports')
def get_manage_reports():
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        supplier_id = request.args.get('supplier_id')
        status = request.args.get('status')
        owner_id = request.args.get('owner_id')

        query = LaporanHarian.query.options(joinedload(LaporanHarian.lapak).joinedload(Lapak.penanggung_jawab))
        if owner_id: query = query.join(Lapak, LaporanHarian.lapak_id == Lapak.id).filter(Lapak.owner_id == owner_id)
        if status and status != 'semua': query = query.filter(LaporanHarian.status == status)
        elif not status: query = query.filter(LaporanHarian.status == 'Menunggu Konfirmasi')
        
        if start_date_str: query = query.filter(LaporanHarian.tanggal >= datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date())
        if end_date_str: query = query.filter(LaporanHarian.tanggal <= datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date())
        if supplier_id: query = query.join(LaporanHarian.rincian_produk).join(LaporanHarianProduk.product).filter(Product.supplier_id == supplier_id).distinct()

        reports = query.order_by(LaporanHarian.tanggal.desc()).all()
        report_list = [{
            "id": r.id, "lokasi": r.lapak.lokasi, "penanggung_jawab": r.lapak.penanggung_jawab.nama_lengkap, 
            "tanggal": r.tanggal.isoformat(), "total_pendapatan": r.total_pendapatan, "total_produk_terjual": r.total_produk_terjual, 
            "status": r.status, "keuntungan_owner": r.keuntungan_owner, "keuntungan_superowner": r.keuntungan_superowner
        } for r in reports]
        return jsonify({"success": True, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/confirm_report/<int:report_id>', methods=['POST'])
def confirm_report(report_id):
    try:
        data = request.json
        owner_id = data.get('owner_id')
        report = LaporanHarian.query.options(joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier).joinedload(Supplier.balance)).get(report_id)

        if not report or report.status == 'Terkonfirmasi': return jsonify({"success": False, "message": "Laporan tidak valid."}), 400
        report.status = 'Terkonfirmasi'
        
        for rincian in report.rincian_produk:
            if rincian.product.supplier and rincian.product.supplier.balance:
                rincian.product.supplier.balance.balance += rincian.total_harga_beli
            
        total_profit = report.total_pendapatan - report.total_biaya_supplier
        keuntungan_superowner = total_profit * PROFIT_SHARE_SUPEROWNER_RATIO
        keuntungan_owner = total_profit * PROFIT_SHARE_OWNER_RATIO
        report.keuntungan_owner = keuntungan_owner
        report.keuntungan_superowner = keuntungan_superowner
        
        managing_owner = Admin.query.get(owner_id) 
        if managing_owner and managing_owner.super_owner_id:
            so_balance = SuperOwnerBalance.query.filter_by(super_owner_id=managing_owner.super_owner_id, owner_id=managing_owner.id).first()
            if so_balance: so_balance.balance += keuntungan_superowner
            else: db.session.add(SuperOwnerBalance(super_owner_id=managing_owner.super_owner_id, owner_id=managing_owner.id, balance=keuntungan_superowner))

        db.session.commit()
        return jsonify({"success": True, "message": "Laporan dikonfirmasi."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/get_pembayaran_data', methods=['GET'])
def get_pembayaran_data():
    try:
        owner_id = request.args.get('owner_id')
        suppliers = Supplier.query.filter_by(owner_id=owner_id).options(joinedload(Supplier.balance)).all()
        supplier_list = []
        for s in suppliers:
            tanggal_tagihan_masuk = None
            if s.balance and s.balance.balance > 0.01:
                oldest_report_date = db.session.query(func.min(LaporanHarian.tanggal)).select_from(LaporanHarian).\
                  join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id).\
                  join(Product, LaporanHarianProduk.product_id == Product.id).\
                  filter(Product.supplier_id == s.id, LaporanHarian.status == 'Terkonfirmasi').scalar()
                if oldest_report_date: tanggal_tagihan_masuk = oldest_report_date.isoformat()

            supplier_list.append({
                "supplier_id": s.id, "nama_supplier": s.nama_supplier, "total_tagihan": s.balance.balance if s.balance else 0.0, 
                "metode_pembayaran": s.metode_pembayaran, "nomor_rekening": s.nomor_rekening, "tanggal_masuk": tanggal_tagihan_masuk
            })
        return jsonify({"success": True, "supplier_balances": supplier_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/submit_pembayaran', methods=['POST'])
def submit_pembayaran():
    data = request.json
    supplier_id = data.get('supplier_id')
    jumlah_dibayar = float(data.get('jumlah_pembayaran', 0))
    supplier = Supplier.query.get(supplier_id)
    if not supplier or not supplier.balance or supplier.balance.balance < (jumlah_dibayar - 0.01):
        return jsonify({"success": False, "message": "Pembayaran tidak valid."}), 400
    try:
        new_payment = PembayaranSupplier(supplier_id=supplier_id, jumlah_pembayaran=jumlah_dibayar, metode_pembayaran=supplier.metode_pembayaran)
        db.session.add(new_payment)
        supplier.balance.balance -= jumlah_dibayar
        db.session.commit()
        return jsonify({"success": True, "message": "Pembayaran berhasil."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/get_chart_data', methods=['GET'])
def get_chart_data():
    try:
        year = int(request.args.get('year', datetime.date.today().year))
        month = int(request.args.get('month', datetime.date.today().month))
        _, num_days = monthrange(year, month)
        labels = [str(i) for i in range(1, num_days + 1)]
        pendapatan_data = {day: 0 for day in labels}
        biaya_data = {day: 0 for day in labels}

        pendapatan_results = db.session.query(func.extract('day', LaporanHarian.tanggal), func.sum(LaporanHarian.total_pendapatan)).filter(
            func.extract('year', LaporanHarian.tanggal) == year, func.extract('month', LaporanHarian.tanggal) == month, LaporanHarian.status == 'Terkonfirmasi'
        ).group_by(func.extract('day', LaporanHarian.tanggal)).all()

        biaya_results = db.session.query(func.extract('day', PembayaranSupplier.tanggal_pembayaran), func.sum(PembayaranSupplier.jumlah_pembayaran)).filter(
            func.extract('year', PembayaranSupplier.tanggal_pembayaran) == year, func.extract('month', PembayaranSupplier.tanggal_pembayaran) == month
        ).group_by(func.extract('day', PembayaranSupplier.tanggal_pembayaran)).all()

        for day, total in pendapatan_results: pendapatan_data[str(int(day))] = total
        for day, total in biaya_results: biaya_data[str(int(day))] = total
        
        return jsonify({"success": True, "labels": labels, "pendapatanData": list(pendapatan_data.values()), "biayaData": list(biaya_data.values())})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/finalize_reports', methods=['POST'])
def finalize_reports():
    data = request.json
    report_ids = data.get('report_ids', [])
    try:
        reports_to_finalize = LaporanHarian.query.filter(LaporanHarian.id.in_(report_ids), LaporanHarian.status == 'Terkonfirmasi').all()
        for report in reports_to_finalize: report.status = 'Difinalisasi'
        db.session.commit()
        return jsonify({"success": True, "message": "Laporan difinalisasi."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": "Gagal finalisasi."}), 500

@owner_bp.route('/api/get_supplier_bill_breakdown/<int:supplier_id>', methods=['GET'])
def get_supplier_bill_breakdown(supplier_id):
    try:
        start_of_month = datetime.date.today().replace(day=1)
        query = db.session.query(
            LaporanHarian.tanggal, Lapak.lokasi, Admin.nama_lengkap.label('pj_name'), func.sum(LaporanHarianProduk.total_harga_beli).label('total_tagihan_harian')
        ).join(LaporanHarianProduk, LaporanHarian.id == LaporanHarianProduk.laporan_id).join(Product, LaporanHarianProduk.product_id == Product.id)\
         .join(Lapak, LaporanHarian.lapak_id == Lapak.id).join(Admin, Lapak.user_id == Admin.id)\
         .filter(Product.supplier_id == supplier_id, LaporanHarian.status == 'Terkonfirmasi', LaporanHarian.tanggal >= start_of_month)\
         .group_by(LaporanHarian.tanggal, Lapak.id).order_by(LaporanHarian.tanggal.desc(), Lapak.lokasi)

        breakdown = {}
        for r in query.all():
            tgl = r.tanggal.strftime('%Y-%m-%d')
            if tgl not in breakdown: breakdown[tgl] = {"tanggal_formatted": r.tanggal.strftime('%d %B %Y'), "items": [], "total_hari_ini": 0}
            breakdown[tgl]["items"].append({"lokasi": r.lokasi, "pj": r.pj_name, "nominal": r.total_tagihan_harian})
            breakdown[tgl]["total_hari_ini"] += r.total_tagihan_harian
        return jsonify({"success": True, "breakdown": list(breakdown.values())})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@owner_bp.route('/api/get_report_details/<int:report_id>')
def get_report_details(report_id):
    try:
        report = LaporanHarian.query.options(joinedload(LaporanHarian.lapak).joinedload(Lapak.penanggung_jawab), joinedload(LaporanHarian.rincian_produk).joinedload(LaporanHarianProduk.product).joinedload(Product.supplier).joinedload(Supplier.balance)).get(report_id)
        if not report: return jsonify({"success": False, "message": "Laporan tidak ditemukan"}), 404

        supplier_status = {}
        rincian_per_supplier = {}
        for item in report.rincian_produk:
            sup = item.product.supplier
            sup_name = sup.nama_supplier if sup else "Produk Manual"
            if sup and sup.id not in supplier_status:
                last_pay = PembayaranSupplier.query.filter_by(supplier_id=sup.id).order_by(PembayaranSupplier.tanggal_pembayaran.desc()).first()
                supplier_status[sup.id] = {"name": sup_name, "total_hutang_saat_ini": sup.balance.balance if sup.balance else 0, "terakhir_dibayar": last_pay.tanggal_pembayaran.strftime('%d %B %Y') if last_pay else "Belum pernah"}
            
            if sup_name not in rincian_per_supplier: rincian_per_supplier[sup_name] = []
            rincian_per_supplier[sup_name].append({
                "nama_produk": item.product.nama_produk, "stok_awal": item.stok_awal, "stok_akhir": item.stok_akhir, 
                "terjual": item.jumlah_terjual, "harga_jual": item.product.harga_jual, "total_pendapatan": item.total_harga_jual
            })

        data = {
            "id": report.id, "tanggal": report.tanggal.strftime('%d %B %Y'), "status": report.status,
            "lokasi": report.lapak.lokasi, "penanggung_jawab": report.lapak.penanggung_jawab.nama_lengkap,
            "rincian_per_supplier": rincian_per_supplier, "supplier_status": supplier_status,
            "rekap_otomatis": {"terjual_cash": report.pendapatan_cash, "terjual_qris": report.pendapatan_qris, "terjual_bca": report.pendapatan_bca, "total_produk_terjual": report.total_produk_terjual, "total_pendapatan": report.total_pendapatan, "total_biaya_supplier": report.total_biaya_supplier},
            "rekap_manual": {"terjual_cash": report.manual_pendapatan_cash, "terjual_qris": report.manual_pendapatan_qris, "terjual_bca": report.manual_pendapatan_bca, "total_produk_terjual": report.total_produk_terjual, "total_pendapatan": report.manual_total_pendapatan}
        }
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500