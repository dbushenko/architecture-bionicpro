-- Создание таблицы для показаний датчиков
CREATE TABLE sensor_readings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL, -- UUID из Keycloak
    sensor_type VARCHAR(50) NOT NULL,
    sensor_value NUMERIC NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы для агрегированных данных по датчикам
CREATE TABLE aggregated_sensor_data (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL, -- UUID из Keycloak
    sensor_type VARCHAR(50) NOT NULL,
    aggregation_period VARCHAR(10) NOT NULL, -- 'daily' или 'monthly'
    period_date DATE NOT NULL, -- дата начала периода (день или первый день месяца)
    measurement_count INTEGER NOT NULL,
    min_value NUMERIC,
    max_value NUMERIC,
    avg_value NUMERIC,
    trend VARCHAR(10) CHECK (trend IN ('increase', 'decrease', 'stable')) -- тренд за период
);