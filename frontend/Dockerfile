# syntax=docker/dockerfile:1.7
FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js /usr/share/nginx/html/
RUN mkdir -p /usr/share/nginx/html/dist /usr/share/nginx/html/img
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
