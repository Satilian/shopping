# Список покупок

PWA для повторного использования списка. Отмеченные товары появляются во вкладке «Купить». После покупки снимите отметку: товар останется в общем списке.

## Локальный запуск

Требуется Node.js 24.

```powershell
npm ci
npm run build
npm start
```

Откройте http://localhost:3000. `npm run dev` запускает фронтенд с HMR на порту 5173. Для проверки установки и офлайн-режима используйте собранную PWA на порту 3000.

## Android

Запустите AVD и выполните:

```powershell
adb reverse tcp:3000 tcp:3000
adb shell am start -a android.intent.action.VIEW -d http://localhost:3000 -p com.android.chrome
```

В Chrome выберите «Добавить на главный экран» → «Установить», если доступно. Данные первого этапа хранятся в браузере устройства. Keycloak, PostgreSQL, Redis и доступ к общим группам между аккаунтами относятся к серверному этапу. LAN-хост для инфраструктуры — `192.168.100.51`.

## Деплой

Workflow **Build and deploy PWA** запускается вручную. Он собирает и публикует образ в GHCR и разворачивает Helm-релиз в K3s на `shopping.root.sx`.

- Variable — опционально `CLUSTER_ISSUER`.
- Secrets — `KUBECONFIG`, `GHCR_USERNAME`, `GHCR_PAT`.
- Kubernetes API должен быть доступен из runner. Для TLS нужен либо настроенный ClusterIssuer, либо secret `shopping-list-tls` в namespace `shopping-list`. DNS домена должен указывать на ingress.

## Общие списки

1. Примените `migrations/001_shared_lists.sql` к базе PostgreSQL через `psql -v ON_ERROR_STOP=1 -f migrations/001_shared_lists.sql`, передав параметры подключения выбранным способом.
2. Создайте конфиденциальный OIDC-клиент в Keycloak с Authorization Code Flow и PKCE S256. Зарегистрируйте точный redirect URI `https://shopping.root.sx/api/auth/callback`.
3. Создайте Kubernetes Secret в namespace `shopping-list` с ключами `DATABASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` и `PUBLIC_URL`. Для боевого адреса используйте `PUBLIC_URL=https://shopping.root.sx`. `OIDC_ISSUER` — HTTPS URL realm, доступный браузеру и серверу.
4. Укажите имя этого секрета в переменной GitHub Actions `SHARED_LISTS_SECRET` и запустите workflow.

При локальном запуске эти же параметры можно передать как переменные окружения. Без `OIDC_ISSUER` приложение запускается в локальном режиме.
