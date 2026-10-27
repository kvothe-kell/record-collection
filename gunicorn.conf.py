import os

bind = os.environ.get("GUNICORN_BIND", "127.0.0.1:5002")

workers = 1
worker_class = "gthread"
threads = 4
timeout = 120

accesslog = "-"
errorlog = "-"
loglevel = "info"

reload = False
