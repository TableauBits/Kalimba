# example run command:
# docker run -p 3000:3000 [--rm --it] <name|ID>

FROM node:alpine

WORKDIR /kalimba
COPY . /kalimba

CMD ["node", "./dist/index.js"]
EXPOSE 3000
