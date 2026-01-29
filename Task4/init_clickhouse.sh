#!/bin/bash

# Ждем пока ClickHouse будет готов принимать запросы
until clickhouse-client --host clickhouse --port 9000 --query "SELECT 1"; do
  echo "Waiting for ClickHouse to be ready..."
  sleep 5
done

echo "ClickHouse is ready. Creating tables..."

# Создаем таблицы
clickhouse-client --host clickhouse --port 9000 --multiquery < /docker-entrypoint-initdb.d/create_clickhouse_tables.sql

echo "Tables created successfully!"