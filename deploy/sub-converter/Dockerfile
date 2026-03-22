FROM node:22-alpine
WORKDIR /app
COPY deploy/sub-converter/package.json ./package.json
RUN npm install --omit=dev
COPY deploy/sub-converter/server.js ./server.js
COPY deploy/sub-converter/src ./src
COPY deploy/sub-converter/config ./config
COPY deploy/sub-converter/rules ./rules
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["npm", "start"]
