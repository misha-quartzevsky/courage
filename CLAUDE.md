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
  (`cours | revision | codex | profil`). Стейт — `useState` в App, вниз пропсами.
  Контекста/стора нет.
- **Один глобальный CSS** — `src/styles.css` (CSS-переменные-токены). Ни Tailwind,
  ни CSS-модулей. Классы BEM-ish.
- **Иконки** — инлайновый SVG в `src/lib/icons.tsx`. **Эмодзи в UI запрещены.**
- **Строки UI — русские, инлайн в JSX.** i18n нет. Французский появляется только как
  учебный контент.
- **Supabase опционален.** Задан `VITE_SUPABASE_*` → auth по magic link + профиль +
  синк прогресса. Не задан → демо-режим (`DEMO_PERSONA`, localStorage).
- **Gemini** проксируется через Cloudflare Worker (`worker/worker.ts`) — Google
  геоблокит РФ. Тот же Worker по крону раз в час шлёт пуш-напоминания.
- **PWA:** `vite-plugin-pwa` (injectManifest), свой SW `src/sw.ts` (прекэш + веб-пуши),
  тост «Обновить» из `src/lib/pwa-update.ts`. Хостинг фронта — **Cloudflare Pages**
  (`public/_headers` для кэша), Worker — `wrangler deploy`.

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
- **Пуш-напоминания:** текст генерится из ближайшего правила (`src/lib/teaser.ts`,
  `buildTeaser`), ручной override — поле `push_teaser_ru` в
  `grammar-rules-A1-A2-B1.json`. Тап ведёт в `/?rule=<id>` → App открывает разминку.
  Время — окно `[reminder_hour, reminder_hour_to]`, час на день выбирается
  детерминированно. Пасхалка «Бомжур» — первым пушем один раз. Детали —
  `docs/push-notifications.md`.
- `worker/worker.ts` импортит **чистые** `src/lib/syllabus.ts` / `grammar.ts` /
  `teaser.ts` напрямую (в них нет Vite/DOM-зависимостей) — логику не дублируем.
- Грамматика — данные, не код: `grammar-rules-A1-A2-B1.json` → `src/lib/grammar.ts`
  (`RULES`, `getRule`). Каталог юнитов выводится из правил в `syllabus.ts`.

## Ключевые файлы

| Что | Где |
|---|---|
| Стейт-машина, вся обвязка | `src/App.tsx` |
| Прогресс (localStorage + Supabase), миграции | `src/lib/storage.ts`, `src/lib/types.ts` |
| Каталог: юниты, сессии, `nextSession` | `src/lib/syllabus.ts` |
| Грамматика (данные) | `grammar-rules-A1-A2-B1.json` → `src/lib/grammar.ts` |
| Лёгкий режим | `src/screens/LessonWarmup.tsx`, `src/lib/warmup.ts` |
| Спринт + фолбэк + парсинг Gemini | `src/lib/gemini.ts`, `src/screens/Sprint.tsx` |
| Пуши: клиент / воркер / текст | `src/lib/push.ts`, `worker/worker.ts`, `src/lib/teaser.ts` |
| PWA | `vite.config.ts`, `src/sw.ts`, `src/lib/pwa-update.ts` |
| Дизайн-токены + все компонентные стили | `src/styles.css` |

## Более глубокие доки

`docs/PRODUCT.md` (видение, персоны, формула 70/30), `docs/DESIGN.md` (визуальный тон),
`docs/ARCHITECTURE.md`, `docs/push-notifications.md` (миграции Supabase, VAPID, крон),
`docs/TESTING.md`. Часть значений в них может отставать от кода — при расхождении
верить коду.

## Деплой

- Фронт: пуш в `master` → Cloudflare Pages собирает сам.
- Worker: `wrangler deploy` руками (в бандл входят `src/lib/*` + grammar JSON).
- Схема БД: SQL-миграции держим в `docs/push-notifications.md`, запускает пользователь
  в Supabase.
