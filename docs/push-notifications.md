# Пуш-напоминания

Веб-пуши для PWA. На iPhone работают только если сайт добавлен на экран «Домой»
(Safari → «Поделиться» → «На экран „Домой“») и запускается оттуда, iOS 16.4+.

Схема: клиент подписывается (`src/lib/push.ts`), строка подписки пишется прямо в
таблицу `push_subscriptions` под RLS. Раз в час Cloudflare Worker по Cron Trigger
(`worker/worker.ts` → `scheduled`) находит тех, у кого наступил час напоминания и
кто ещё не занимался сегодня, и шлёт им пуш.

**Текст пуша генерится, не хранится.** Обычный пуш — затравка под ближайшее правило
(то, что вернёт `nextSession` по `progress.rules` + `target_level`): контраст с
русским / «проверь догадку», строится в `src/lib/teaser.ts` (`buildTeaser`), можно
переопределить полем `push_teaser_ru` у правила в `grammar-rules-A1-A2-B1.json`. Тап
ведёт сразу в разминку правила (`url = /?rule=<id>`, разбирается в `src/App.tsx`).
Самый первый пуш аккаунта — пасхалка «Бомжур» (флаг `bonjour_easter_done`).

**Время.** `reminder_hour_to = null` → ровно `reminder_hour`. Если задано — окно
`[reminder_hour, reminder_hour_to]`, конкретный час на сегодня выбирается
детерминированно по дате (`pickHour` в worker). В Настройках это чип
«19–21, случайно» (`reminder_hour = 19, reminder_hour_to = 21`).

## 1. Миграция Supabase

```sql
-- Час напоминания и отметка «сегодня уже уведомлён»
alter table profiles
  add column if not exists reminder_hour int not null default 19,
  add column if not exists reminder_hour_to int,          -- окно [reminder_hour, reminder_hour_to]
  add column if not exists last_notified_on date,
  add column if not exists bonjour_easter_done boolean not null default false;

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Cron в Worker ходит с service-role ключом — RLS его не касается.

## 2. VAPID-ключи

Пара уже сгенерирована для проекта. Публичный лежит в `.env`
(`VITE_VAPID_PUBLIC_KEY`) и в `.env.example` как имя переменной.

Сгенерировать новую пару (P-256, формат под `@block65/webcrypto-web-push`):

```bash
node --input-type=module -e "
const kp = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
const fromB64 = s => Uint8Array.from(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64'));
const toB64 = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
const raw = new Uint8Array(65); raw[0]=4; raw.set(fromB64(pub.x),1); raw.set(fromB64(pub.y),33);
console.log('public :', toB64(raw));
console.log('private:', priv.d);
"
```

`public` → `VITE_VAPID_PUBLIC_KEY` в `.env` **и** секрет Worker'а `VAPID_PUBLIC_KEY`
(это один и тот же ключ). `private` → только секрет Worker'а.

## 3. Секреты Worker'а

```bash
wrangler secret put VAPID_PUBLIC_KEY          # = VITE_VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT             # mailto:real.alice.montgomery@gmail.com
wrangler secret put SUPABASE_URL              # https://<project>.supabase.co
wrangler secret put SUPABASE_SERVICE_ROLE_KEY # Supabase → Project Settings → API
```

Cron уже объявлен в `wrangler.toml` (`crons = ["0 * * * *"]`). Если секреты не
заданы — `scheduled` просто выходит без рассылки.

Таймзона напоминаний зафиксирована в `worker/worker.ts` (`TZ = 'Europe/Moscow'`) —
`reminder_hour` хранится как локальный час без tz. Фолбэк-текст и пасхалка — там же
(`FALLBACK_*`, `BONJOUR_EASTER`); основной текст — `src/lib/teaser.ts`.

## 4. Проверка

- **Локально:** `wrangler dev --test-scheduled`, затем
  `curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"` — в логах видно выборку
  и отправку; endpoint с ответом 404/410 удаляется из таблицы.
  В логах видно собранный `title` / `body` / `url = /?rule=<следующее правило>`.
  Поменяешь `reminder_hour` (или окно) — не тот час → рассылка пропускается.
- **iPhone:** задеплоить (`npm run build` + `wrangler deploy`), добавить сайт на
  экран «Домой», открыть оттуда, Настройки → «Напоминать заниматься» → выдать
  разрешение → выбрать час или «19–21, случайно» → дождаться пуша. Тап по пушу
  должен открыть разминку того самого правила.
