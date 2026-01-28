from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import psycopg2
import logging

# Определение DAG
default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'sensor_data_aggregation',
    default_args=default_args,
    description='ETL для агрегации данных датчиков',
    schedule_interval='*/1 * * * *',  # Каждую минуту
    catchup=False,
    tags=['etl', 'sensors'],
)

def aggregate_sensor_data(**kwargs):
    """
    Функция для агрегации данных из sensor_readings в aggregated_sensor_data
    """
    # Подключение к базе данных напрямую
    conn = psycopg2.connect(
        host="api_db",
        database="api_db",
        user="api_user",
        password="api_password"
    )
    cursor = conn.cursor()

    # Получаем дату за которую нужно выполнить агрегацию
    # В данном случае - за текущий день
    execution_date = kwargs['execution_date']
    target_date = execution_date.strftime('%Y-%m-%d')

    logging.info(f"Начинаем агрегацию данных за {target_date}")

    # Сначала удаляем старые агрегированные данные за этот день
    delete_query = """
    DELETE FROM aggregated_sensor_data
    WHERE period_date = %s;
    """

    try:
        cursor.execute(delete_query, (target_date,))
        conn.commit()
        logging.info(f"Удалены старые агрегированные данные за {target_date}")
    except Exception as e:
        logging.error(f"Ошибка при удалении старых агрегированных данных: {str(e)}")
        raise

    # Проверим, сколько записей будет обработано
    count_query = "SELECT COUNT(*) FROM sensor_readings WHERE DATE(timestamp) = %s::date;"
    cursor.execute(count_query, (target_date,))
    record_count = cursor.fetchone()[0]
    logging.info(f"Найдено {record_count} записей для агрегации за {target_date}")

    if record_count == 0:
        logging.info(f"Нет данных для агрегации за {target_date}, пропускаем")
        cursor.close()
        conn.close()
        return

    # SQL-запрос для агрегации данных
    agg_query = """
    WITH previous_avg AS (
        SELECT
            user_id,
            sensor_type,
            AVG(sensor_value) as avg_value
        FROM sensor_readings
        WHERE DATE(timestamp) < %s::date
        GROUP BY user_id, sensor_type
    ),
    daily_agg AS (
        SELECT
            sr.user_id,
            sr.sensor_type,
            COUNT(*) as measurement_count,
            MIN(sr.sensor_value) as min_value,
            MAX(sr.sensor_value) as max_value,
            AVG(sr.sensor_value) as avg_value
        FROM sensor_readings sr
        WHERE DATE(sr.timestamp) = %s::date
        GROUP BY sr.user_id, sr.sensor_type
    )
    INSERT INTO aggregated_sensor_data (
        user_id,
        sensor_type,
        aggregation_period,
        period_date,
        measurement_count,
        min_value,
        max_value,
        avg_value,
        trend
    )
    SELECT
        da.user_id,
        da.sensor_type,
        'daily' as aggregation_period,
        %s::date as period_date,
        da.measurement_count,
        da.min_value,
        da.max_value,
        da.avg_value,
        CASE
            WHEN pa.avg_value IS NULL THEN 'stable'
            WHEN da.avg_value > pa.avg_value THEN 'increase'
            WHEN da.avg_value < pa.avg_value THEN 'decrease'
            ELSE 'stable'
        END as trend
    FROM daily_agg da
    LEFT JOIN previous_avg pa ON da.user_id = pa.user_id AND da.sensor_type = pa.sensor_type;
    """

    try:
        cursor.execute(agg_query, (target_date, target_date, target_date))
        conn.commit()
        logging.info(f"Успешно агрегированы данные за {target_date}")
    except Exception as e:
        logging.error(f"Ошибка при агрегации данных: {str(e)}")
        raise
    finally:
        cursor.close()
        conn.close()

# Определение задач
aggregate_task = PythonOperator(
    task_id='aggregate_sensor_data_task',
    python_callable=aggregate_sensor_data,
    dag=dag,
)

# Установка зависимостей (теперь только одна задача)