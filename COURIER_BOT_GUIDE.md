# 🚴 CampusEats Courier Bot — Полный Гайд

> **Дата создания:** 26 февраля 2026  
> **Токен бота:** `8712157596:AAFQLeLB8dwf0Gz7kP69ocxyiiYwX2SMaQQ`  
> **Бот:** [@YourCourierBotUsername]

---

## 📋 Содержание

1. [Архитектура системы](#1-архитектура-системы)
2. [База данных — таблицы](#2-база-данных)
3. [Как запустить](#3-как-запустить)
4. [Поток работы со стороны бота](#4-поток-бота)
5. [API эндпоинты](#5-api-эндпоинты)
6. [Суперадмин панель — эндпоинты](#6-суперадмин-панель)
7. [Бизнес-правила и безопасность](#7-бизнес-правила)
8. [Фоновые задачи](#8-фоновые-задачи)
9. [Тестирование бота](#9-тестирование)
10. [Переменные окружения](#10-переменные-окружения)

---

## 1. Архитектура системы

```
┌─────────────────────────────────────────────────────────┐
│                   CampusEats Backend                      │
│                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Express API  │    │ Courier Bot  │    │ SLA Worker│  │
│  │ (REST)       │    │ (Telegram)   │    │ (Cron)    │  │
│  └──────┬───────┘    └──────┬───────┘    └─────┬─────┘  │
│         │                   │                  │         │
│  ┌──────▼───────────────────▼──────────────────▼─────┐  │
│  │              courier.service.js                    │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                 │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │                  PostgreSQL Database               │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Ключевые принципы:**
- Все состояния хранятся в базе данных (не только в памяти)
- Защита от race conditions через `SELECT FOR UPDATE` + транзакции
- Только встроенные клавиатуры (inline keyboards) — никаких reply keyboards
- Все действия логируются в `audit_logs`

---

## 2. База данных

### Таблица: `couriers`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | |
| phone | VARCHAR UNIQUE | Логин |
| password_hash | TEXT | bcrypt хэш |
| telegram_id | BIGINT UNIQUE | Привязывается при первом входе |
| full_name | VARCHAR | Имя курьера |
| status | VARCHAR | `active` / `blocked` |
| is_online | BOOLEAN | Онлайн-статус |
| rating | FLOAT | Рейтинг (1.0–5.0), по умолчанию 5.0 |
| total_ratings | INT | Кол-во оценок |
| completed_orders | INT | Завершённых заказов |
| cash_on_hand | NUMERIC | Наличные у курьера (UZS) |
| total_earnings | NUMERIC | Общий заработок |
| created_at | TIMESTAMP | |

### Таблица: `courier_orders`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | |
| order_id | INT → orders | |
| courier_id | INT → couriers | |
| assigned_at | TIMESTAMP | Время назначения |
| accepted_at | TIMESTAMP | Время принятия |
| picked_up_at | TIMESTAMP | Время забора |
| delivered_at | TIMESTAMP | Время доставки |
| earnings | NUMERIC | Заработок курьера |
| sla_status | VARCHAR | `on_time` / `breached` |

### Таблица: `cash_movements`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | |
| courier_id | INT → couriers | |
| order_id | INT → orders (nullable) | |
| type | VARCHAR | `cash_collected` / `cash_submitted` |
| amount | NUMERIC | Сумма в UZS |
| status | VARCHAR | `completed` / `pending` / `approved` |

### Таблица: `courier_incidents` (SOS)
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | |
| courier_id | INT → couriers | |
| order_id | INT → orders | |
| reason | VARCHAR | Причина SOS |
| status | VARCHAR | `open` / `resolved` |

### Таблица: `courier_rating_requests`
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PRIMARY KEY | |
| order_id | INT → orders | |
| courier_id | INT → couriers | |
| user_telegram_id | BIGINT | Telegram клиента |
| rating_message_id | BIGINT | ID сообщения с звёздочками |
| rating | INT | 1–5 (NULL до оценки) |
| status | VARCHAR | `pending` / `rated` |

### Расширение таблицы `orders`:
Добавленные поля:
- `courier_id INT` → ссылка на курьера
- `delivery_status VARCHAR` — `pending` / `accepted` / `picked_up` / `on_way` / `delivered` / `attention_required`
- `sla_delivery_deadline TIMESTAMP` — дедлайн (assigned_at + 35 мин)
- `sla_status VARCHAR` — `NULL` (пока не нарушен) / `breached`
- `payment_method VARCHAR` — `cash` / `card_transfer`
- `payment_status VARCHAR` — `unpaid` / `paid`

---

## 3. Как запустить

### Шаг 1: Запустить миграции БД

```bash
# Основная схема курьеров
node migrate_courier.js

# Таблица рейтингов и индексы
node run_migration_006.js
```

### Шаг 2: Проверить .env

```env
COURIER_BOT_TOKEN=8712157596:AAFQLeLB8dwf0Gz7kP69ocxyiiYwX2SMaQQ
COURIER_CASH_LIMIT=500000
COURIER_EARNINGS_PER_ORDER=15000
```

### Шаг 3: Запустить сервер

```bash
npm start        # Production
npm run dev      # Development (nodemon)
```

Бот запустится автоматически вместе с сервером.

---

## 4. Поток бота

### 🔐 Регистрация / Вход

```
Курьер отправляет /start
    ↓
Бот проверяет telegram_id в БД
    ↓
Если найден → Главное меню
Если нет   → Запрашивает телефон → Запрашивает пароль
    ↓ (вход успешен)
Telegram_id сохраняется в таблице couriers
    ↓
Главное меню
```

> **Важно:** Сообщение с паролем автоматически удаляется из чата (`deleteMessage`)

### 🟢 Главное меню (inline keyboard)

```
🟢 Go Online  │  📦 Active Order
📊 My Stats   │  💰 Cash On Hand
🏦 Submit Cash│  👤 Profile
      🚨 SOS Emergency
```

### 📦 Машина состояний заказа

```
ready_for_pickup (сторона ресторана)
    ↓ [система отправляет курьеру]
offer_accept → accepted
    ↓ [кнопка: 📍 Picked Up]
picked_up
    ↓ [кнопка: 🚗 On the Way]
on_way
    ↓ [кнопка: 💵 Cash Received] (если наличные)
    ↓ [кнопка: ✅ Delivered]
delivered → система отправляет рейтинг клиенту
```

### ⭐ Система рейтинга

После доставки клиент получает сообщение:
```
⭐ Rate Your Delivery

Order #123 was delivered by [CourierName].
How was your delivery?

[⭐1] [⭐⭐2] [⭐⭐⭐3] [⭐⭐⭐⭐4] [⭐⭐⭐⭐⭐5]
```

Формула обновления рейтинга:
```
new_rating = (old_rating × total_ratings + stars) / (total_ratings + 1)
```

### 🚨 SOS

```
Курьер нажимает 🚨 SOS
    ↓
Выбирает причину (5 вариантов)
    ↓
Запись в courier_incidents
    ↓
Уведомление суперадмину в Telegram
    ↓
Заказ помечается как attention_required
```

---

## 5. API эндпоинты

### Аутентификация курьера

```
POST /api/courier/login
Body: { phone, password }
Response: { token, courier }
```

Все остальные эндпоинты требуют заголовок:
```
Authorization: Bearer <token>
```

### Основные эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/courier/me` | Профиль и статистика |
| POST | `/api/courier/online` | Онлайн/офлайн `{ is_online: true/false }` |
| GET | `/api/courier/active-order` | Текущий активный заказ |
| POST | `/api/courier/offers/:id/accept` | Принять предложение |
| POST | `/api/courier/order/:id/picked-up` | Забрал из ресторана |
| POST | `/api/courier/order/:id/delivered` | Доставил клиенту |
| POST | `/api/courier/order/:id/cash-received` | Получил наличные `{ amount }` |
| POST | `/api/courier/cash/submit` | Запрос на сдачу наличных `{ amount }` |
| POST | `/api/courier/sos` | SOS `{ order_id, reason }` |
| GET | `/api/courier/cash-movements` | История движений наличных |

---

## 6. Суперадмин панель

Все эндпоинты требуют auth токен суперадмина.  
Базовый путь: `/api/admin/`

### Управление курьерами

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/courier-dashboard` | Общая статистика курьеров |
| GET | `/api/admin/couriers` | Список всех курьеров |
| POST | `/api/admin/couriers/create` | Создать нового курьера |
| GET | `/api/admin/couriers/:id` | Детали курьера |
| POST | `/api/admin/couriers/:id/block` | Заблокировать |
| POST | `/api/admin/couriers/:id/unblock` | Разблокировать |
| POST | `/api/admin/couriers/:id/reset-password` | Сбросить пароль |

### Мониторинг

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/courier-incidents` | SOS инциденты (`?status=open`) |
| POST | `/api/admin/courier-incidents/:id/resolve` | Закрыть инцидент |
| GET | `/api/admin/courier-sla-breaches` | Нарушения SLA |
| GET | `/api/admin/cash-submissions` | Запросы на сдачу наличных |
| POST | `/api/admin/cash-submissions/:id/confirm` | Подтвердить сдачу наличных |

### GET `/api/admin/courier-dashboard` — ответ:
```json
{
  "totalCouriers": 15,
  "onlineCouriers": 8,
  "activeDeliveries": 5,
  "slaBreaches": 2,
  "openIncidents": 1,
  "pendingCashSubmissions": 450000,
  "totalCashOnHand": 1250000,
  "avgCourierRating": 4.72
}
```

---

## 7. Бизнес-правила

### ✅ Безопасность

| Правило | Реализация |
|---------|-----------|
| Курьер не может принять 2 заказа | `SELECT FOR UPDATE` проверка перед `acceptOffer()` |
| Дублирование принятия заказа | `courier_id IS NOT NULL` проверка с транзакцией |
| Заблокированный не может выйти онлайн | Проверка `status === 'active'` в `setOnline()` |
| Лимит наличных | `cash_on_hand >= COURIER_CASH_LIMIT` → отказ в онлайн |
| Переходы состояний заказа | Валидация через `validTransitions` map |

### 💵 Работа с наличными

- **Лимит наличных:** 500,000 UZS (настраивается через `COURIER_CASH_LIMIT`)
- Превышение лимита → нельзя выйти онлайн → нельзя принять новые заказы
- `cash_collected` записывается при нажатии "💵 Cash Received"
- `cash_submitted` записывается при запросе сдачи, статус `pending`
- Суперадмин подтверждает → статус меняется на `approved`

### ⭐ Рейтинг

- Начальный рейтинг: 5.0
- Нарушение SLA → рейтинг -0.05 (минимум 1.0)
- Оценка от клиента → взвешенное среднее
- Клиент может оценить только один раз на заказ

---

## 8. Фоновые задачи

### SLA Worker — каждую минуту

Проверяет:
1. Заказы с `sla_delivery_deadline < NOW()` и `sla_status IS NULL`
2. Помечает их как `breached`
3. Уведомляет курьера в Telegram
4. Уведомляет суперадмина
5. Снижает рейтинг курьера на 0.05

### Dispatch Queue

Вызывается когда `order.status = 'ready_for_pickup'`:
1. Ищет доступных курьеров (онлайн, активен, под лимитом наличных, без активного заказа)
2. Сортирует по рейтингу (лучшие вперёд)
3. Отправляет предложение 3 курьерам одновременно
4. Первый кто принял — получает заказ (транзакция предотвращает дубли)

---

## 9. Тестирование

### Создать тестового курьера через API:
```bash
curl -X POST https://your-backend.com/api/admin/couriers/create \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+998901234567", "password": "test123", "full_name": "Test Courier"}'
```

### Проверить бота:
1. Откройте бот в Telegram
2. Отправьте `/start`
3. Введите телефон: `+998901234567`
4. Введите пароль: `test123`
5. Получите главное меню

### Тест диспатча заказа:
```bash
# Установить заказ в статус ready_for_pickup
curl -X POST https://your-backend.com/api/admin/orders/<id>/status \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"status": "ready_for_pickup"}'
# Бот автоматически отправит предложение онлайн-курьерам
```

### Проверить инциденты:
```bash
curl https://your-backend.com/api/admin/courier-incidents \
  -H "Authorization: Bearer <admin_token>"
```

### Проверить наличные:
```bash
curl https://your-backend.com/api/admin/cash-submissions \
  -H "Authorization: Bearer <admin_token>"
```

---

## 10. Переменные окружения

```env
# База данных
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Безопасность
JWT_SECRET=your_jwt_secret_key

# Основной Telegram бот (пользователи)
TELEGRAM_BOT_TOKEN=<main_bot_token>
TELEGRAM_GROUP_ID=<group_id>

# Курьерский бот
COURIER_BOT_TOKEN=8712157596:AAFQLeLB8dwf0Gz7kP69ocxyiiYwX2SMaQQ

# Бизнес-настройки
COURIER_CASH_LIMIT=500000          # Лимит наличных в UZS
COURIER_EARNINGS_PER_ORDER=15000   # Заработок за заказ в UZS

# Среда
NODE_ENV=production
PORT=5000
```

---

## 📂 Структура файлов

```
src/
├── bot/
│   ├── courierBot.js          # Telegram бот (весь UI через inline keyboards)
│   └── slaWorker.js           # Cron задача для SLA мониторинга
├── services/
│   └── courier.service.js     # Вся бизнес-логика (транзакции, рейтинг, cash)
├── routes/
│   ├── courier.routes.js      # REST API для курьеров
│   └── admin.routes.js        # +12 новых эндпоинтов для управления курьерами
├── db/
│   └── migrations/
│       ├── 005_courier_schema.sql           # Основные таблицы
│       └── 006_courier_rating_requests.sql  # Рейтинги + индексы
migrate_courier.js         # Запускает миграцию 005
run_migration_006.js       # Запускает миграцию 006
```

---

## ⚡ Ключевые особенности реализации

1. **Race condition защита**: `SELECT ... FOR UPDATE` + `BEGIN/COMMIT/ROLLBACK` в каждой транзакции принятия заказа
2. **Дублирование предотвращено**: Проверка `courier_id IS NOT NULL` под блокировкой строки
3. **Машина состояний**: Переходы валидируются (`accepted → picked_up → on_way → delivered`)
4. **Серверные сессии**: Хранятся в Map на сервере (step: awaiting_phone/awaiting_password/awaiting_amount)
5. **Аудит**: Все действия логируются в `audit_logs`
6. **Уведомления**: Суперадмин получает Telegram уведомления о SOS, SLA нарушениях, запросах наличных
7. **Масштабируемость**: Архитектура поддерживает 100+ курьеров

---

*Создано: CampusEats Team | 26 февраля 2026*
