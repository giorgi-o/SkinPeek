FROM node:17-alpine

WORKDIR /usr/app

COPY package.json .
RUN npm i
COPY . .

CMD ["node", "SkinPeek.js"]
