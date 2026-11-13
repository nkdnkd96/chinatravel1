cat << 'EOF' > /project/chinatravel1/backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./
EXPOSE 4000
CMD ["node", "server.js"]
EOF

docker compose up -d --build