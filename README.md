# Список покупок

PWA для повторного использования списка. Отмеченные товары появляются во вкладке «Купить». После покупки снимите отметку: товар останется в общем списке.

## Локальный запуск

Требуется Node.js 24.

```powershell
npm ci
npm run build
npm start
```

Откройте http://localhost:3000. Для запуска общих списков локально скопируйте шаблон и заполните параметры:

```powershell
Copy-Item .env.example .env
npm run dev
```

`npm run dev` собирает приложение и запускает NestJS с переменными из `.env`. Открывайте адрес из `PUBLIC_URL` для работы с API и входа. `npm run dev:web` запускает только фронтенд с HMR на порту 5173.

В шаблоне указаны NodePort Keycloak и PostgreSQL. Подставьте имя realm, ID и секрет конфиденциального OIDC-клиента, пользователя, пароль и имя базы. Спецсимволы в логине и пароле PostgreSQL закодируйте для URL. В Keycloak зарегистрируйте точный redirect URI `http://localhost:3000/api/auth/callback`. Значение `OIDC_ISSUER` должно совпадать с полем `issuer` в discovery-документе realm. Параметр `OIDC_ALLOW_INSECURE_HTTP` разрешает HTTP-соединение с Keycloak для локального запуска. Для Keycloak по HTTPS удалите его или задайте `false`.

## Android

Запустите AVD и выполните:

```powershell
adb reverse tcp:3000 tcp:3000
adb shell am start -a android.intent.action.VIEW -d http://localhost:3000 -p com.android.chrome
```

В Chrome выберите «Добавить на главный экран» → «Установить», если доступно. Данные первого этапа хранятся в браузере устройства. Keycloak, PostgreSQL, Redis и доступ к общим группам между аккаунтами относятся к серверному этапу. LAN-хост для инфраструктуры — `192.168.100.51`.

## Деплой

Workflow **Build and deploy PWA** запускается при пуше в `main` и доступен для ручного запуска. Он собирает и публикует образ в GHCR и разворачивает Helm-релиз в K3s на `shopping.root.sx`.

- Variables — `GHCR_USERNAME`, опционально `CLUSTER_ISSUER`.
- Secrets — `KUBECONFIG`, `GHCR_PAT`.
- Kubernetes API должен быть доступен из runner. По умолчанию TLS выдаёт Traefik через ACME resolver `myresolver`. Для cert-manager задайте `CLUSTER_ISSUER`, для готового TLS Secret задайте `ingress.tlsSecret` в Helm. DNS домена должен указывать на ingress. HTTP перенаправляется на HTTPS через Traefik Middleware.

## Общие списки

1. Примените `migrations/001_shared_lists.sql` к базе PostgreSQL через `psql -v ON_ERROR_STOP=1 -f migrations/001_shared_lists.sql`, передав параметры подключения выбранным способом.
2. Создайте конфиденциальный OIDC-клиент в Keycloak с Authorization Code Flow и PKCE S256. Зарегистрируйте точный redirect URI `https://shopping.root.sx/api/auth/callback`.
3. Создайте Kubernetes Secret в namespace `shopping-list` с ключами `DATABASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` и `PUBLIC_URL`. Для боевого адреса используйте `PUBLIC_URL=https://shopping.root.sx` и `OIDC_ISSUER=https://webmax.root.sx:30081/realms/YOUR_REALM`. Домен Keycloak должен разрешаться и быть доступен по HTTPS из браузера и пода приложения.
4. Укажите имя этого секрета в переменной GitHub Actions `SHARED_LISTS_SECRET` и запустите workflow.

Если Keycloak использует частный CA или самоподписанный сертификат, задайте в локальном `.env` путь к доверенному PEM-файлу:

```dotenv
OIDC_CA_FILE="C:/certs/keycloak.crt"
```

`npm run dev` передаёт переменную серверному процессу при запуске Node.js. Сертификат должен соответствовать имени хоста или IP из HTTPS issuer.

При локальном запуске эти же параметры можно передать как переменные окружения. Без `OIDC_ISSUER` приложение запускается в локальном режиме.
