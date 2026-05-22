# Frontend

## Описание

React/Vite frontend платформы управления LLM-сервисами. Покрывает деплой моделей, релизы, трафик, затраты, квоты, инфраструктуру, доступы и аудит.

## Основные возможности

- авторизация/регистрация и role-based UI
- страницы деплоя, релизов, роутинга трафика, квот и затрат
- realtime/operational dashboard
- интеграция с deployment-service и security-audit-service

## Структура проекта

- `src/` - исходный код frontend
- `src/pages/` - страницы приложения
- `src/api/` - клиенты backend API
- `src/components/` - переиспользуемые UI-компоненты
- `deploy/` - nginx, k8s и helm-файлы деплоя
- `vite.config.ts`, `package.json`

## Быстрый старт (локально)

1. Установить зависимости:
   `npm install`
2. Запустить dev-сервер:
   `npm run dev`
3. Собрать production build:
   `npm run build`

## Переменные окружения

- `VITE_API_URL` - базовый URL backend API
- `VITE_SECURITY_API_URL` - базовый URL security API

## Деплой

- Docker/K8s/Helm файлы находятся в `deploy/`
- основной nginx-конфиг: `deploy/nginx.conf`
