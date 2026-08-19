# Передача: раздел «Инстаграм» и хостинг картинок (19.08.2026)

Сделано другой сессией (окно контент-завода), дальше ведёт это окно.

## Состояние
- Раздел `/insta` (только OWNER) и `/api/ig/host` задеплоены на
  postos.dobro-inc.com, env в Coolify заполнены (META_TOKEN, META_IG_IDS —
  7 аккаунтов, BRAND_MAP, IG_HOST_KEY). Хостинг картинок ПРОВЕРЕН —
  POST/GET работают, завод каруселей уже переключён на этот URL.
- Плановый сбор — instrumentation.ts, 07:00 UTC, внутри процесса.
- Коммит `ae37fba` (сбор не умирает от одного недоступного аккаунта)
  запушен, но НЕ задеплоен — нужно нажать Redeploy в Coolify.

## Осталось
1. Redeploy в Coolify (подтянет ae37fba).
2. «Собрать сейчас» на /insta — должно собрать 6 аккаунтов.
3. **superfit24_training (17841435633230475) потерял доступ токена 19.08**
   (утром работал): «does not exist / missing permissions». Чинится в
   Meta Business — привязка актива к системному пользователю. Это же
   ломает публикацию нарезок в training у контент-завода.
4. После проверки удалить Netlify-сайты insta-hq-roman, superfit-ig-host,
   luxury-biscuit-4ec309 (сироты; дашборд и хостинг теперь здесь).

## Границы с окном контент-завода
- Контракт между проектами один: `POST https://postos.dobro-inc.com/api/ig/host`
  с заголовком X-Host-Key (env IG_HOST_KEY у завода) → {url}. Менять только
  синхронно с /opt/superfit/app/.env на сервере.
- Публикация в Instagram (Reels, карусели) — код завода
  (`content_converter/Контент Завод/auto/ig.py`), НЕ Postos.
