#!/bin/bash

# Ждем пока ClickHouse будет готов принимать запросы
until clickhouse-client --host localhost --port 9000 --query "SELECT 1"; do
  echo "Waiting for ClickHouse to be ready..."
  sleep 5
done

# Ждем пока Kafka будет готова
until echo > /dev/tcp/kafka/9092; do
  echo "Waiting for Kafka to be ready..."
  sleep 5
done

echo "ClickHouse and Kafka are ready. Creating tables..."

# Создаем таблицы
clickhouse-client --host localhost --port 9000 --multiquery < /docker-entrypoint-initdb.d/create_clickhouse_tables_final.sql

echo "Tables created successfully!"

# Завершаем скрипт, позволяя основному процессу ClickHouse продолжать работу
exit 0