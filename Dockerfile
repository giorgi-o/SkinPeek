FROM node:latest

WORKDIR /usr/app

COPY . .
RUN npm i

CMD ["node", "SkinPeek.js"]
