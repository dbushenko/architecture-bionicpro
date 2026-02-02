FROM alpine:latest

# Установка mc (MinIO client)
RUN apk add --no-cache curl && \
    wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc

COPY setup_buckets.sh /setup_buckets.sh
RUN chmod +x /setup_buckets.sh

CMD ["/setup_buckets.sh"]