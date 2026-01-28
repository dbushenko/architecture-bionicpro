#!/bin/bash

# Ожидание запуска MinIO
sleep 10

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