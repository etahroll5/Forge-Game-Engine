FROM node:20-alpine
WORKDIR /app

# No runtime dependencies — the engine is plain ES modules served as static files.
# Copy only what the editor needs. A blanket `COPY . .` would also ship .git
# (whose config embeds the build-time GitHub token), tests, node_modules and
# package-lock.json, all of which the static server would then expose over HTTP.
COPY index.html ./index.html
COPY server.js ./server.js
COPY package.json ./package.json
COPY styles ./styles
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

# Run as the unprivileged user that ships with the base image.
USER node

CMD ["node", "server.js"]
