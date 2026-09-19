FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir . && useradd --uid 10001 --create-home xform && mkdir -p /app/data && chown xform:xform /app/data
COPY dist ./static
COPY deploy/server.py ./server.py
USER xform
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz')"
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
