FROM node:20-alpine

WORKDIR /app

COPY . /app

WORKDIR /app/apps/api



# Install dependencies for the API service

RUN npm install --only=production

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll use the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create storage directory and set permissions
RUN mkdir -p /app/storage && chown -R node:node /app/storage

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
USER node
CMD ["node", "src/index.js"]
