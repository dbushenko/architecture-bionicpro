FROM alpine:latest

# Установка mc (MinIO client)
RUN apk add --no-cache curl && \
    wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc

COPY minio-setup.sh /minio-setup.sh
RUN chmod +x /minio-setup.sh

CMD ["/minio-setup.sh"]