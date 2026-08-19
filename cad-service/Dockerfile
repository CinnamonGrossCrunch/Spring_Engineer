# build123d pulls in OpenCascade through the cadquery-ocp wheels, which carry
# their own native libraries. The slim image still needs a few system libs that
# those wheels link against.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglu1-mesa \
        libxi6 \
        libxmu6 \
        libsm6 \
        libice6 \
        libx11-6 \
        libfontconfig1 \
        libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Dependencies first so the (large) OCP layer caches independently of app code.
#
# pyproject declares packages = ["app"], so `pip install .` needs that directory
# to exist. Stand up an empty one to install the dependency tree, then uninstall
# the stub distribution (its dependencies stay) and drop the directory.
COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && mkdir -p app && : > app/__init__.py \
    && pip install . \
    && pip uninstall -y spring-cad-service \
    && rm -rf app

COPY app ./app

EXPOSE 8000

# Fail the container's health check if the CAD kernel cannot be imported.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request,sys,json; \
port=os.environ.get('PORT','8000'); \
r=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=8)); \
sys.exit(0 if r.get('status')=='ok' else 1)"

# Shell form so ${PORT} is expanded at runtime; defaults to 8000 when unset.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
