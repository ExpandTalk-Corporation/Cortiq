# Base image ships Chrome for Testing matching this Puppeteer version (Apache-2.0); no Browserless code.
FROM ghcr.io/puppeteer/puppeteer:25.16.0

WORKDIR /home/pptruser/app
COPY --chown=pptruser:pptruser package.json package-lock.json ./
# Chrome is already in the image's Puppeteer cache — don't download it again.
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev --no-audit --no-fund
COPY --chown=pptruser:pptruser app.mjs server.mjs ./

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
