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
