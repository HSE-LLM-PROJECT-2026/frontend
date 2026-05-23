# Frontend

## Описание

Веб-интерфейс платформы управления LLM-сервисами. Через него пользователь деплоит модели, смотрит состояние кластеров, управляет трафиком, релизами, квотами, затратами и доступами.

## Основные возможности

- дашборд с текущим состоянием платформы
- форма развертывания модели
- список deployment-объектов и действия над ними
- управление traffic routes и весами
- канареечные релизы и rollback
- страницы затрат, квот, инфраструктуры, аудита и доступов
- настройки экономики и конфигов развертываний

## Структура проекта

- `src/` — исходный код приложения
- `src/pages/` — страницы интерфейса
- `src/api/` — клиенты backend API
- `src/components/` — переиспользуемые компоненты
- `src/context/` — контекст кластера, языка и состояния приложения
- `public/` — статические файлы и runtime config
- `deploy/` — Docker, nginx, Helm и deploy-скрипты
- `package.json`, `vite.config.ts`, `tsconfig.json` — сборка frontend

## Быстрый старт локально

1. Установить зависимости:
   ```bash
   npm install
   ```

2. Запустить dev-сервер:
   ```bash
   npm run dev
   ```

3. Собрать production build:
   ```bash
   npm run build
   ```

## Переменные окружения

- `VITE_API_URL` — URL management API
- `VITE_SECURITY_API_URL` — URL security/audit API
- `VITE_REAL_CLUSTER_ID` — основной cluster id для UI
- `VITE_REAL_CLUSTER_LABEL` — отображаемое имя кластера

Пример лежит в `.env.example`.

## Docker

```bash
docker build -f deploy/Dockerfile -t awesomecosmonaut/frontend:latest .
docker run -p 8080:80 awesomecosmonaut/frontend:latest
```

## Деплой

```bash
cd deploy
./deploy-from-scratch.sh
```

Полная пересборка и переустановка:

```bash
cd deploy
./rebuild-delete-deploy.sh
```

## Автор

Igor Malysh
