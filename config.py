import os

class Config:
	#menggunakan path absolut agar database tidak nyasar
	BASEDIR = os.path.abspath(os.path.dirname(__file__))
	SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASEDIR, 'app.db')
	SQLALCHEMY_TRACK_MODIFICATIONS = False
	SECRET_KEY = 'ini-kunci-rahasia'