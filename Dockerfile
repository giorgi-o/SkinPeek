FROM node:latest

WORKDIR /usr/app

COPY . .
RUN npm i

VOLUME /usr/app/config.js

CMD ["node", "SkinPeek.js"]
