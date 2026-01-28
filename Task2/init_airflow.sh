#!/bin/bash

echo "Запуск всех сервисов..."

# Запускаем все сервисы кроме airflow-scheduler и airflow-webserver
docker-compose up -d --scale airflow-scheduler=0 --scale airflow-webserver=0 postgres-airflow api_db keycloak_db keycloak bionicpro-auth sensor_api frontend ldap

echo "Ожидание запуска зависимостей..."
sleep 30

echo "Инициализация базы данных Airflow..."
docker-compose run --rm airflow-scheduler airflow db init

echo "Запуск Airflow сервисов..."
docker-compose up -d airflow-scheduler airflow-webserver

echo "Все сервисы запущены!"
echo "Airflow Web UI будет доступен на http://localhost:8082"
echo "Sensor API будет доступен на http://localhost:8000"
echo "Frontend будет доступен на http://localhost:3000"