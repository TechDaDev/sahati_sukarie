FROM node:24-bookworm-slim

WORKDIR /app

ARG APP_URL
ENV APP_URL=${APP_URL} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SAHATI_PDF_RENDERER_PYTHON=/opt/sahati-weasyprint/bin/python

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip \
      libcairo2 libffi8 libfontconfig1 libfreetype6 libgdk-pixbuf-2.0-0 \
      libharfbuzz0b libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
      shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-pdf.txt ./
RUN python3 -m venv /opt/sahati-weasyprint \
    && /opt/sahati-weasyprint/bin/pip install --no-cache-dir -r requirements-pdf.txt

COPY package.json package-lock.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm ci --include=dev --verbose

COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    SESSION_SECRET=security-test-session-secret-with-32-bytes \
    FIELD_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    NATIONAL_ID_PEPPER=security-test-national-id-pepper-with-32-bytes \
    npm run build \
    && npm run test:security \
    && /opt/sahati-weasyprint/bin/python -m unittest tests/security/pdf_renderer_test.py -v \
    && mkdir -p /tmp/sahati-weasy-poc \
    && node_modules/.bin/tsx scripts/render_pdf_html_fixture.ts \
    && python3 -c "from pathlib import Path; p=Path('/tmp/sahati-weasy-poc/backend-integration.pdf'); b=p.read_bytes(); assert b.startswith(b'%PDF-') and len(b) > 10000; print('synthetic PDF bytes:', len(b))" \
    && rm -rf /tmp/sahati-weasy-poc \
    && npm prune --omit=dev \
    && mkdir -p .next/cache \
    && chown -R node:node .next

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
