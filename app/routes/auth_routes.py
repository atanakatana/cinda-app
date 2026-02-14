from flask import Blueprint, render_template, jsonify, request
from app.models import SuperOwner, Supplier, Admin, Lapak
from app.extensions import db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/')
def login_page():
    return render_template('index.html') 
  
@auth_bp.route('/api/login', methods=['POST'])
def handle_login():
    data = request.json
    username = data.get('username', '').lower().strip() # Tambah strip()
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"success": False, "message": "Mohon isi username dan password"}), 400

    # 1. Cek Admin (Owner atau Staff Lapak)
    # Gunakan query spesifik, jangan ambil .all()
    admin_found = Admin.query.filter(db.func.lower(Admin.username) == username).first()
    
    if admin_found and admin_found.check_password(password):
        # Cek Role berdasarkan kolom 'role' atau super_owner_id
        is_owner = admin_found.role == 'owner' or admin_found.super_owner_id is not None
        
        if is_owner:
            return jsonify({
                "success": True, 
                "role": "owner", 
                "user_info": {"nama_lengkap": admin_found.nama_lengkap, "id": admin_found.id}
            })
        else:
            # Login sebagai Staff Lapak
            lapak_info = Lapak.query.filter_by(user_id=admin_found.id).first()
            if not lapak_info:
                lapak_info = Lapak.query.filter(Lapak.anggota.any(id=admin_found.id)).first()
            
            return jsonify({
                "success": True, 
                "role": "lapak", 
                "user_info": {
                    "nama_lengkap": admin_found.nama_lengkap, 
                    "lapak_id": lapak_info.id if lapak_info else None, 
                    "id": admin_found.id
                }
            })
      
    # 2. Cek Supplier
    supplier = Supplier.query.filter(db.func.lower(Supplier.username) == username).first()
    if supplier and supplier.check_password(password):
        return jsonify({
            "success": True, 
            "role": "supplier", 
            "user_info": {"nama_supplier": supplier.nama_supplier, "supplier_id": supplier.id}
        })
      
    # 3. Cek Superowner
    superowner = SuperOwner.query.filter(db.func.lower(SuperOwner.username) == username).first()
    if superowner and superowner.check_password(password):
        return jsonify({
            "success": True, 
            "role": "superowner", 
            "user_info": {"username": superowner.username, "id": superowner.id}
        })
        
    return jsonify({"success": False, "message": "Username atau password salah"}), 401