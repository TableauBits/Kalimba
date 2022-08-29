FROM node:alpine

WORKDIR /kalimba
copy . /kalimba
RUN npm install

EXPOSE 3000

ENTRYPOINT ["npm", "start"]
