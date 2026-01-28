#!/bin/sh

# Устанавливаем алиас для MinIO
mc alias set local http://minio:9000 minioadmin minioadmin --api S3v4

# Проверяем и создаем бакет reports, если он не существует
if ! mc ls local/reports > /dev/null 2>&1; then
  mc mb local/reports
  mc anonymous set download local/reports
  echo 'Бакет reports создан и настроена политика'
else
  echo 'Бакет reports уже существует'
fi

# Проверяем и создаем бакет logs, если он не существует
if ! mc ls local/logs > /dev/null 2>&1; then
  mc mb local/logs
  mc anonymous set public local/logs
  echo 'Бакет logs создан и настроена политика'
else
  echo 'Бакет logs уже существует'
fi

# Проверяем и создаем бакет temp, если он не существует
if ! mc ls local/temp > /dev/null 2>&1; then
  mc mb local/temp
  mc anonymous set public local/temp
  echo 'Бакет temp создан и настроена политика'
else
  echo 'Бакет temp уже существует'
fi

echo 'Настройка бакетов завершена'