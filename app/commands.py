import click
from flask.cli import with_appcontext
from app.extensions import db
from app.models import SuperOwner, Admin, Supplier, SupplierBalance, Product, Lapak

@click.command(name='seed-db')
@with_appcontext
def seed_db_command():
    """Menghapus database dan membuat data awal"""
    db.drop_all()
    db.create_all()
    print("Database dibuat ulang...")

    try:
        # -- membuat superowner awal --
        super_owner = SuperOwner(username="cinda", password="cinda", nama_lengkap="Bos Cinda", email="cinda@gmail.com", nomor_kontak="081234567890")
        db.session.add(super_owner)
        db.session.commit()
        print("SuperOwner berhasil dibuat.")
      
        # -- membuat admin awal --
        owner = Admin(nama_lengkap="Pak Owner", username="owner", email="owner@example.com", nomor_kontak="08222222222", password="owner", super_owner_id=super_owner.id)
        db.session.add(owner)
        db.session.commit()
        print("Admin Owner berhasil dibuat.")
      
        # -- membuat supplier awal --
        supplier = Supplier(nama_supplier="CV. Sumber Rejeki", username="supplier", kontak="08333333333", nomor_register="REG001", alamat="Jl. Gudang Garam No. 1", password="supplier", metode_pembayaran="BCA", nomor_rekening="1234567890", owner_id=owner.id)
        supplier.balance = SupplierBalance(balance=0.0)
        db.session.add(supplier)
        db.session.commit()
        print("Supplier berhasil dibuat.")
      
        # -- membuat produk awal --
        prod1 = Product(nama_produk="Kopi Bubuk Arabica", supplier_id=supplier.id, harga_beli=15000, harga_jual=25000, is_manual=False)
        prod2 = Product(nama_produk="Susu Kental Manis", supplier_id=supplier.id, harga_beli=10000, harga_jual=12000, is_manual=False)
        db.session.add_all([prod1, prod2])
      
        # -- membuat lapak awal --
        admin_lapak = Admin(nama_lengkap="Si Penjaga Lapak", username="lapak", email="lapak@example.com", nomor_kontak="08444444444", password="lapak", created_by_owner_id=owner.id)
        db.session.add(admin_lapak)
        db.session.commit()
        
        lapak = Lapak(lokasi="Lapak Pusat - Jakarta", user_id=admin_lapak.id, owner_id=owner.id)
        lapak.products.append(prod1)
        lapak.products.append(prod2)
        db.session.add(lapak)
        db.session.commit()
       
        print("\n=== Seed Data Berhasil Hore! ===")
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: {e}")
