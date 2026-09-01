# CLAUDE.md — ориентир для новой сессии

Читается автоматически при старте. Цель — чтобы не пересматривать весь проект с нуля.
Рабочие правила (YAGNI, «пользователей двое», не плодить .md) — в [AGENTS.md](AGENTS.md),
они в силе.

## Зачем это всё (use-case)

Личное приложение для изучения французского на **двух человек**: тот, кто его пишет
(this user), и **его жена** — она главный ученик, под неё принимаются продуктовые решения.

Про жену (контекст всех решений про мотивацию/UX):
- **Хирург.** Подъём в 6, весь день в операционной, домой к 18–19. Вечером почти пустой
  бюджет на умственное и волевое усилие.
- Французский учить **хочет** (мотивация есть), но **нетерпеливая**, любопытная, креативная.
- Пробовала **Duolingo и бросила** — однообразие, стрик как источник вины, награда
  «сделай → получишь» превращают занятие в обязанность.
- Общая цель пары — **переезд во Францию**. На преподавателей нет ресурса (деньги, время,
  эмоции), поэтому приложение — основной способ подтянуть язык.

Из этого следует продуктовая линия (drive-motivation / hooked-ux):
- всё должно работать при минимуме усилий в усталый вечер (сессия 60–90 сек);
- никакого давления и loss aversion; стрик — радость **внутри** приложения, не угроза в пуше;
- зацепка через любопытство («вот интересная штука»), а не долг;
- автономия: «пропустить» / «на сегодня хватит» — всегда first-class.

## Стек (быстрые факты)

- **React 19 + TypeScript (strict) + Vite 6.** Тесты — Vitest, окружение `node`,
  только `src/lib/**/*.test.ts` (экраны не тестируем).
- `npm run build` = `tsc --noEmit && vite build`. Прогоняй его перед коммитом.
- **Роутера нет.** Навигация — стейт-машина в `src/App.tsx`: `overlay`
  (`onboarding | warmup | sprint | debrief | null`) + нижний `TabBar`
  (`cours | revision | dictionary | codex | profil`). Стейт — `useState` в App, вниз пропсами.
  Контекста/стора нет.
- **Один глобальный CSS** — `src/styles.css` (CSS-переменные-токены). Ни Tailwind,
  ни CSS-модулей. Классы BEM-ish.
- **Иконки** — инлайновый SVG в `src/lib/icons.tsx`. **Эмодзи в UI запрещены.**
- **Строки UI — русские, инлайн в JSX.** i18n нет. Французский появляется только как
  учебный контент.
- **Supabase опционален.** Задан `VITE_SUPABASE_*` → auth по одноразовому коду (OTP)
  + профиль + синк прогресса. **На iOS PWA** вход только по коду, не по ссылке
  (ссылка открывается в Safari, PWA не получает сессию). Не задан → демо-режим
  (`DEMO_PERSONA`, localStorage).
- **Gemini** проксируется через Cloudflare Worker (`worker/worker.ts`) — Google
  геоблокит РФ. Тот же Worker по крону раз в час шлёт пуш-напоминания.
- **PWA:** `public/manifest.webmanifest` (display: standalone), SW — `src/sw.ts`
  (vite-plugin-pwa, `injectManifest`; прекэш ассетов + обработчики `push` /
  `notificationclick` + cache-first для `/dict/fr-ru.json`). Иконки — серифная C (Newsreader 700,
  шрифт логотипа). На iOS 16.4+ веб-пуши работают только если сайт добавлен на
  экран «Домой». Хостинг фронта — **Cloudflare Pages** (автосборка на пуш в master),
  Worker — `npx wrangler deploy` вручную.

## Архитектура, которую долго выясняли

- **Сессия = одно грамматическое правило.** 36 юнитов → 103 правила. Юнит = список
  коротких сессий. `src/lib/syllabus.ts`: `SESSIONS` (плоский список в курсовом
  порядке), `nextSession(doneRuleIds, targetLevel?)`, `sessionByRuleId`, `unitProgress`.
- **Прогресс считается по правилам.** `ProgressState.rules: Record<ruleId, RuleRecord>`
  — источник истины; `ProgressState.units` — производный кэш (пересобирается
  `deriveUnitRecord` / `rebuildUnits` в `src/lib/storage.ts`, отдельно не пишется).
  Пиши через `recordSessionCompletion(...)`; `recordLightSession()` двигает только стрик.
  Мерж с Supabase (`mergeServerProgress`) пересобирает `units` из `rules`.
- **Лёгкий режим** (`src/screens/LessonWarmup.tsx` + `src/lib/warmup.ts`): интерактивная
  разминка по одному правилу (prime → guess → reveal-как-ответ → explore → build → итог),
  целиком на клиенте, без Gemini. В конце развилка «На сегодня хватит» /
  «Ещё немного — практика». Открывается как `overlay='warmup'` через `openSession`.
- **Практика** — спринт из ~4 упражнений по одному правилу (`generateSprint` в
  `src/lib/gemini.ts`, фолбэк детерминированный). `SprintSession` несёт `ruleId`/`ruleTitleFr`.
  У каждого упражнения кроме `match` — обязательное `sentenceRu` (полный перевод
  французской фразы, виден всегда; санитайзер выкидывает упражнение без него).
  Типы: `dialogue` (судит Gemini) + локальные `gap`/`choice`/`order`/`transform`/
  `match`/`comprehension`. `comprehension` — рецептивная проверка: прочитать
  `textFr` и ответить на `questionRu` по смыслу (RU-варианты), 1 на спринт;
  проверяется как `choice` (`check.ts`). Фолбэк гарантирует одно (`getFallbackSprint`).
- **Чередование грамматики (interleaving).** `generateSprint(..., interleave)` —
  сверх 4 заданий фокуса добавляет по одному на 1–2 ранее пройденных правила.
  Список даёт `interleaveRules(progress, ruleId)` (приоритет — слабые
  `bestAccuracy < 70`, добор давними). `target = 4 + interleave.length` во всех
  местах добора/среза. Прогресс всё равно пишется только на `ruleId`-фокус.
- **Понятный ввод (мини-текст).** `SprintSession.reading = { fr, ru }` — связный
  текст 4–6 предложений на правило-фокус. Просит Gemini (`buildSprintSystemPrompt`,
  поле `reading` в схеме, парсится в `sanitizeSprint`), фолбэк —
  `readingFromExamples(rule)` (склейка `authentic_examples`). Показывается в Debrief
  («Мини-текст») с озвучкой.
- **Словарь урока.** `SprintSession.glossary` собирается в `src/lib/glossary.ts`
  (`buildSessionGlossary`): глоссарий модели + пары `match` + односложные `choice` +
  слова вердиктов, дедуп по слову. `attachExamples` проставляет каждому слову
  `exampleFr`/`exampleRu` — предложение из фраз спринта / мини-текста (контекст,
  показывается во вкладке «Словарь»). Debrief показывает глоссарий целиком
  («Слова из урока»), эти же слова идут в `ProgressState.words`.
- **Вкладка «Словарь»** (`src/screens/Dictionary.tsx`) — два слоя, два режима:
  - **«По темам»** (по умолчанию): курированное тематическое ядро A1–B1 (~1300
    слов, 32 темы: животные, еда, погода, тело, эмоции…). Источник — авторский
    `scripts/themed-words.mjs` (`THEMES`), сборка `scripts/build-themed-dict.mjs`
    (дедуп внутри темы, сверка каждого fr-заголовка с WikDict, сортировка внутри
    темы по частотности WikDict) → `public/dict/fr-ru-themed.json`
    (`{ f, r, theme, level }`). **В прекэше PWA** (glob в `vite.config.ts`),
    грузится сразу (`loadThemedDict`). Темы идут в порядке файла (A1→A2→B1),
    заголовок + бейдж уровня.
  - **«Поиск»**: большой WikDict (~68k, CC BY-SA 3.0) — `public/dict/fr-ru.json`,
    `scripts/build-dictionary.mjs` (`MAX_SENSES = 2`, стоп-лист мата/грубости
    `VULGAR`/`VULGAR_WORD` режет отдельные значения). В прекэш НЕ входит, грузится
    лениво при входе в «Поиск» (`loadDictionary`: fetch → IndexedDB + cache-first
    route в `src/sw.ts`). Результат поиска: сначала ядро, потом WikDict, дедуп по
    `normFr`.
  - Над обоими режимами — блок «мои слова», сгруппированный по правилу-фокусу
    урока (`ruleId` → `titleRu`), НЕ по смысловым темам. Статус ученика
    (`WordRecord.mastery >= MASTERY_LEARNED` = «пройдено» вручную, тускнеет;
    `toggleWordLearned`) накладывается на любую строку по совпадению `normFr(f)`.
- **Интервальные повторения (SRS).** У каждого слова `interval` (дни: `SRS_STEPS`
  = 1 → 3 → 7 → 16 → 35) и `dueAt`. Верный ответ в Повторении двигает на следующий
  шаг (`dueAt = now + interval`), ошибка сбрасывает к 1 дню
  (`recordSessionCompletion(..., masteredFr, missedFr)`). Слово «пройдено», когда
  `interval >= SRS_LEARNED_INTERVAL` (~30) ИЛИ выставлен `mastery` вручную (см.
  `isLearned`). «Повторение» тянет не случайные 16, а просроченное — `dueWords()`
  (dueAt в прошлом / легаси / только добавленное), сортировка по сроку; мало
  просроченного — добирает ближайшие. Словарь НЕ обрезается по свежести
  (`WORDS_CAP` только предохранитель).
- **Тематические блоки.** `WordRecord.ruleId` = правило-фокус урока, из которого
  слово пришло (проставляется в `recordSessionCompletion` из `session.ruleId`;
  у повторения `session=null` → без темы). `dueWords` группирует выдачу в блоки
  одной темы (`groupByTheme`), блоки — по срочности. `generateRevision` получает
  слова с заголовками тем (`themedWordLines`, `getRule(id).titleRu`) и не мешает
  темы в упражнении; `fallbackRevision` строит `match` по темам. Вкладка «Словарь»
  (`Dictionary.tsx`) секцию «мои слова» показывает блоками по теме (`titleRu`),
  без темы → «Разное».
  Поля `interval`/`dueAt`/`ruleId`/`mastery`/`lastSeenAt` опциональны — старый
  прогресс грузится без миграций.
- **Пуш-напоминания:** подписка пишется в `push_subscriptions` (RLS) из
  [src/lib/push.ts](src/lib/push.ts), кнопка в Профиль → Напоминания.
  Рассылка: Worker по Cron Trigger раз в час (`[triggers].crons = ["0 * * * *"]`),
  обработчик `scheduled` в [worker/worker.ts](worker/worker.ts). Время — по фиксированной зоне
  (`TZ = 'Europe/Moscow'`), час берётся из `reminder_hour` в профиле.
  Если просрочено `>= REVISION_DUE_MIN` слов (`countDueWords` по `progress.words`) —
  пуш зовёт на Повторение (`/?revision=1`), иначе — затравка под ближайшее правило
  (`/?rule=<id>`). Текст пуша настраивается в Worker, не в БД. Детали —
  `docs/push-notifications.md`.
- `worker/worker.ts` импортит **чистые** `src/lib/syllabus.ts` / `grammar.ts` /
  `teaser.ts` напрямую (в них нет Vite/DOM-зависимостей) — логику не дублируем.
- Грамматика — данные, не код: `grammar-rules-A1-A2-B1.json` → `src/lib/grammar.ts`
  (`RULES`, `getRule`). Каталог юнитов выводится из правил в `syllabus.ts`.
  Поле `plain_ru` («в двух словах», простым языком) — в разминке показывается первым,
  `summary`/образование прячутся под «Подробнее». Переписан батч **A1 (33 правила)**;
  A2 + B1 (70) — прежний текст, без `plain_ru` (следующий батч, образец —
  `scripts/simplify-grammar-a1.mjs`). Файл JSON — нестандартное форматирование
  (объекты развёрнуты без отступов, CRLF); правь точечно, не пересериализуй целиком.

## Ключевые файлы

| Что | Где |
|---|---|
| Стейт-машина, вся обвязка | `src/App.tsx` |
| Прогресс (localStorage + Supabase), миграции | `src/lib/storage.ts`, `src/lib/types.ts` |
| Каталог: юниты, сессии, `nextSession` | `src/lib/syllabus.ts` |
| Грамматика (данные) | `grammar-rules-A1-A2-B1.json` → `src/lib/grammar.ts` |
| Лёгкий режим | `src/screens/LessonWarmup.tsx`, `src/lib/warmup.ts` |
| Спринт + фолбэк + парсинг Gemini | `src/lib/gemini.ts`, `src/screens/Sprint.tsx` |
| Словарь урока (сбор всех слов) | `src/lib/glossary.ts` |
| Вкладка «Словарь» + загрузка/поиск | `src/screens/Dictionary.tsx`, `src/lib/dictionary.ts` |
| Ядро A1–B1: данные + сборка | `scripts/themed-words.mjs`, `scripts/build-themed-dict.mjs` → `public/dict/fr-ru-themed.json` |
| Большой словарь + сборка | `public/dict/fr-ru.json`, `scripts/build-dictionary.mjs` |
| Вход по коду (OTP) | `src/lib/supabase.ts`, `src/screens/Login.tsx` |
| Пуши: подписка / рассылка | `src/lib/push.ts`, `worker/worker.ts` |
| PWA: манифест / SW | `public/manifest.webmanifest`, `src/sw.ts`, иконки в `public/` |
| Дизайн-токены + все компонентные стили | `src/styles.css` |

## Более глубокие доки

`docs/PRODUCT.md` (видение, персоны, формула 70/30), `docs/DESIGN.md` (визуальный тон),
`docs/ARCHITECTURE.md`, `docs/push-notifications.md` (миграции Supabase, VAPID, крон),
`docs/TESTING.md`. Часть значений в них может отставать от кода — при расхождении
верить коду.

## Деплой

- **Фронт (Pages):** пуш в `master` → Pages собирает сам (`npm run build`). Секреты через
  дашборд Pages → Environment variables (Production/Preview).
- **Worker:** `npx wrangler deploy` руками (в бандл входят `worker/worker.ts` + чистые
  `src/lib/*` + grammar JSON). Секреты через `wrangler secret put NAME`.
- **Схема БД:** SQL-миграции держим в `docs/push-notifications.md`, запускает пользователь
  в Supabase → SQL Editor.
