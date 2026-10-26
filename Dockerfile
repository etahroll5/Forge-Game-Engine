FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
# IMPORTANT: your server MUST listen on 0.0.0.0 and process.env.PORT.
CMD ["node","app.js"]
