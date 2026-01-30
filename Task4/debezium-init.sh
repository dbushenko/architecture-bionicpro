#!/bin/bash

# Ждем пока Debezium Connect будет готов принимать запросы
until curl -f http://debezium:8083/; do
  echo "Waiting for Debezium Connect to be ready..."
  sleep 5
done

echo "Debezium Connect is ready."

# Удаляем старый коннектор, если он существует
curl -X DELETE http://debezium:8083/connectors/sensor-readings-connector

sleep 5

echo "Creating new connector..."

# Создаем коннектор
curl -X POST \
  -H "Content-Type: application/json" \
  --data @/debezium-postgres-connector.json \
  http://debezium:8083/connectors

echo "Connector created successfully!"