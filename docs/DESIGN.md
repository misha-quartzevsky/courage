# DESIGN.md — Courage

## Design Direction & Aesthetics
- **Style:** Swiss-Editorial / Instrumental Minimalism (в стиле Linear, Things 3, Raycast).
- **Palette:**
  - Background Dark: `#0C0D0E`
  - Surface / Cards: `#16181A`
  - Subtle Borders: `#26292B`
  - Primary Typography: `#EDEDED`
  - Muted Text / Meta: `#889096`
  - Accent Cobalt: `#2454FF`
  - Soft Success: `#2D5A43` / Error: `#5A2D2D`
- **Typography:**
  - Sans-serif (`Geist` / `Inter` / SF Pro) — для инструментального интерфейса.
  - Editorial Serif (`Newsreader` / New York) — для французских диалогов, цитат и примеров.

---

## Core Flows

### 1. Smart Onboarding (~45 сек, Zero-Config)
1. Текстовое поле свободного ввода: *«Чем вы занимаетесь и какие у вас интересы?»* (например: *«Витреоретинальный хирург, горные лыжи, кикбоксинг»*).
2. AI-тегирование: система мгновенно выделяет теги (`Chirurgie vitréorétinienne`, `Ophtalmologie`, `Ski alpin`, `Boxe pieds-poings`).
3. Выбор целевого уровня (A1, A2, B1, B2) $\rightarrow$ генерация учебного плана.

### 2. The Cockpit (Главный экран)
- **Top Bar:** Статус стрика + аватар партнера с его последним успехом.
- **Mode Toggle:** Переключатель в 1 тап: 🎙 **Voice Mode** ⇄ 🤫 **Silent / Metro Mode**.
- **Hero Card:** Рекомендованный спринт дня (например: *Édito B1 • Unité 4: Exprimer une urgence au bloc / dans la vie*).
- **Quick Action:** Кнопка быстрого вызова грамматического справочника **«Aide-Mémoire»**.

### 3. Dual-Mode Sprint Player
- **Voice Mode:**
  - Карточка ситуации $\rightarrow$ натуральный TTS-голос $\rightarrow$ кнопка микрофона с живой аудиоволной $\rightarrow$ моментальная мягкая коррекция.
- **Silent Mode:**
  - Карточка ситуации $\rightarrow$ интерактивная сборка фразы из смысловых блоков (Framer Motion spring physics) $\rightarrow$ быстрый клавиатурный микро-ввод окончаний $\rightarrow$ тап по любому слову открывает контекстный перевод и фонетическую транскрипцию (IPA).

### 4. Debrief Screen
- Оценка точности грамматики и беглости.
- Список 3 выученных слов с кнопкой озвучки.
- Блок разбора ошибок с кнопкой **«Corriger mes erreurs» (Пройти заново ошибки)**.

---

## iOS HIG Compliance
- **Safe Area Insets:** Полный учет Dynamic Island и Home Bar (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- **Touch Targets:** Все интерактивные кнопки $\ge 44 \times 44\text{ pt}$.
- **Haptics:** Тактильный отклик через Capacitor Haptics при тапе блоков, успехе и ошибках.
- **Gestures:** Поддержка свайпа от левого края (Swipe Back) и закрытие шторок свайпом вниз.
- **PWA Prompt:** Баннер подсказки добавления на экран «Домой» при первом запуске в Mobile Safari.