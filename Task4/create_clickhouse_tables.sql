-- Создание таблицы для показаний датчиков
CREATE TABLE sensor_readings (
    id UInt64,
    user_id String,
    sensor_type String,
    sensor_value Float64,
    timestamp DateTime
) ENGINE = MergeTree()
ORDER BY (timestamp, user_id);

-- Создание таблицы для агрегированных данных по датчикам
CREATE TABLE aggregated_sensor_data (
    id UInt64,
    user_id String,
    sensor_type String,
    aggregation_period String,
    period_date Date,
    measurement_count UInt32,
    min_value Float64,
    max_value Float64,
    avg_value Float64,
    trend Enum8('increase' = 1, 'decrease' = 2, 'stable' = 3)
) ENGINE = MergeTree()
ORDER BY (period_date, sensor_type, user_id);