FROM node:22-bookworm

WORKDIR /workspace

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=development
ENV PORT=3010
ENV PROJECT_ROOT=/workspace/workspace

RUN mkdir -p /workspace/workspace

EXPOSE 3010

CMD ["npm", "start"]
