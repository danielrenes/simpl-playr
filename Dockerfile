FROM node:10-slim
RUN apt-get update
RUN apt-get -y install libgtkextra-dev libgconf2-dev libnss3 libasound2 libxtst-dev libxss1 libx11-xcb-dev libgtk3.0
WORKDIR /simpl-playr
COPY *.js package*.json ./
COPY icons/ ./icons
COPY lib/ ./lib
COPY static/ ./static
COPY views/ ./views
RUN npm install
CMD ["npm", "start"]