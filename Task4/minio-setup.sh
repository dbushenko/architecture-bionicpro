#!/bin/bash

# Ждем, пока MinIO станет доступен
sleep 30

# Устанавливаем mc (MinIO client) для взаимодействия с MinIO
mc alias set local http://minio:9000 minioadmin minioadmin --api S3v4

# Создание бакета для отчетов
mc mb local/reports
mc anonymous set public local/reports

# Создание бакета для логов
mc mb local/logs
mc anonymous set public local/logs

# Создание бакета для временных файлов
mc mb local/temp
mc anonymous set public local/temp

echo "Бакеты созданы и настроены"