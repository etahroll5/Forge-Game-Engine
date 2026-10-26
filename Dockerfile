FROM node:20-alpine
WORKDIR /app

# No runtime dependencies — the engine is plain ES modules served as static files.
COPY . .

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
