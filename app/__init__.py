from flask import Flask
from config import Config 
from app.extensions import db

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # inisiasi plugin
    db.init_app(app)
    
    # registrasi blueprint auth
    from app.routes.auth_routes import auth_bp
    app.register_blueprint(auth_bp)
    
    # registrasi blueprint superowner
    from app.routes.superowner_routes import superowner_bp
    app.register_blueprint(superowner_bp)
    
    # registrasi blueprint owner
    from app.routes.owner_routes import owner_bp
    app.register_blueprint(owner_bp)
    
    # registrasi blueprint supplier
    from app.routes.supplier_routes import supplier_bp
    app.register_blueprint(supplier_bp)
    
    # registrasi blueprint lapak
    from app.routes.lapak_routes import lapak_bp
    app.register_blueprint(lapak_bp)
    
    # registrasi commands
    from app.commands import seed_db_command
    app.cli.add_command(seed_db_command)
    
    # mulai membuat tabel database jika belum ada
    with app.app_context():
        db.create_all()
        
    return app