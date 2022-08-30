# example run command:
# docker run -p 3000:3000 [--rm --it] <name|ID>

FROM node:alpine

WORKDIR /kalimba
COPY . /kalimba

EXPOSE 3000

ENTRYPOINT ["node", "./dist/index.js"]
