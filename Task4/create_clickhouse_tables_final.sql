-- Создание таблицы для хранения сырых данных из Kafka
CREATE TABLE sensor_readings (
    id UInt64,
    user_id String,
    sensor_type String,
    sensor_value Float64,
    timestamp DateTime
) ENGINE = MergeTree()
ORDER BY (timestamp, user_id);

-- Создание Kafka-таблицы для получения данных из топика
CREATE TABLE sensor_readings_kafka (
    id UInt64,
    user_id String,
    sensor_type String,
    sensor_value Float64,
    timestamp String
) ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'dbserver1.public.sensor_readings',
    kafka_group_name = 'clickhouse_consumer_group',
    kafka_format = 'JSONEachRow';

-- Создание материализованного представления для переноса данных из Kafka в основную таблицу
CREATE MATERIALIZED VIEW sensor_readings_mv TO sensor_readings AS
SELECT
    id,
    user_id,
    sensor_type,
    sensor_value,
    parseDateTimeBestEffort(timestamp) AS timestamp
FROM sensor_readings_kafka;

-- Создание таблицы для агрегированных данных
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
    trend String
) ENGINE = MergeTree()
ORDER BY (period_date, sensor_type, user_id);

-- Создание материализованного представления для агрегации данных
CREATE MATERIALIZED VIEW aggregated_sensor_mv TO aggregated_sensor_data AS
SELECT
    toUInt64(cityHash64(user_id, sensor_type, toString(toDate(timestamp)))) AS id,
    user_id,
    sensor_type,
    'daily' AS aggregation_period,
    toDate(timestamp) AS period_date,
    count(*) AS measurement_count,
    min(sensor_value) AS min_value,
    max(sensor_value) AS max_value,
    avg(sensor_value) AS avg_value,
    'unknown' AS trend
FROM sensor_readings
GROUP BY
    user_id,
    sensor_type,
    period_date;