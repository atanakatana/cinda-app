from app import create_app

app = create_app()

if __name__ == '__main__':
  # debug=True hanya untuk development saja (agar terlihat error)
  app.run(debug=True, port=5001)
  
  
