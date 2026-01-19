from flask import Blueprint, render_template, jsonify, render_template, request
from app.models import SuperOwner, Supplier, Admin, Lapak
from app.extensions import db

# -- membuat blueprint untuk kelompok rute --
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/')
def login_page():
    return render_template ('index.html') 
  
@auth_bp.route('/api/login', methods=['POST'])
def handle_login():
    data = request.json
    username = data.get('username', '').lower()
    password = data.get('password')
    
    # -- cek admin/owner/lapak --
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
      
    # -- cek supplier --
    supplier = Supplier.query.filter(db.func.lower(Supplier.username) == username).first()
    if supplier and supplier.password == password:
        return jsonify({"success": True, "role": "supplier", "user_info": {"nama_supplier": supplier.nama_supplier,"supplier_id": supplier.id}})
      
    # -- cek superowner --
    superowner = SuperOwner.query.filter(db.func.lower(SuperOwner.username) == username).first()
    if superowner and superowner.password == password:
        return jsonify({"success": True, "role": "superowner", "user_info": {"username": superowner.username, "id": superowner.id}})
        
    return jsonify({"success": False, "message": "Username atau password salah"}), 401
    