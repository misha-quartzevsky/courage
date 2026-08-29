# CREATE-APP-PLAN.md — Courage

## Journey Status Tracker

| Phase | Skill | Status | Artifact | Description / Result |
|---|---|---|---|---|
| **1** | `lean-startup` | `done` | `docs/PRODUCT.md`, `docs/EXPERIMENTS.md` | Сформулирована fatal-гипотеза (EXP-001) и скоуп MVP для специалистов. |
| **2** | `design-sprint` | `done` | `docs/DESIGN.md`, `docs/EXPERIMENTS.md` | Спроектированы Smart Onboarding и дуальный плеер (Voice ⇄ Silent). |
| **3** | `clean-architecture` | `done` | `docs/ARCHITECTURE.md` | Изолированы доменные правила, определены порты для LLM и PocketBase. |
| **4** | `domain-driven-design` | `done` | `docs/ARCHITECTURE.md` | Зафиксирован Ubiquitous Language, баланс 70/30 и агрегат `SprintSession`. |
| **5** | `clean-code` | `done` | `docs/TESTING.md` | Настроена пирамида Vitest, pre-commit гейт и инварианты сессий. |
| **6** | `pragmatic-programmer` | `done` | `docs/TESTING.md`, `docs/TECH-DEBT.md` | Спроектирован Tracer Bullet и политика Broken-Windows (`// TODO(debt)`). |
| **7** | `system-design` | `done` | `docs/ARCHITECTURE.md` | Расчет нагрузки (QPS < 5, Gemini Flash), схема PocketBase, Not-Yet list. |
| **8** | `ios-hig-design` | `done` | `docs/DESIGN.md` | Safe Areas, 44pt touch targets, тактильный отклик (Haptics), шторки. |
| **9** | `37signals-way` | `done` | `docs/PRODUCT.md`, `docs/STRATEGY.md` | Сформирован No-List, фиксированный аппетит на v1 и модуль Aide-Mémoire. |
| **10** | `software-design-philosophy` | `done` | `docs/TECH-DEBT.md`, `docs/ARCHITECTURE.md` | Выделены 3 глубоких модуля (`CurriculumEngine`, `VoiceCockpit`, `GrammarCodex`). |

## Key Decisions Log
- **2026-08-29 (Product):** Баланс тем урока: 70% бытовая/жизненная база (Édito) + 30% персональный профиль (хирургия, маркетинг, лыжи, кикбоксинг).
- **2026-08-29 (UX):** Два взаимозаменяемых режима: 🎙 Voice Mode (диалог с голосом) ⇄ 🤫 Silent / Metro Mode (сборка смысловых чанков).
- **2026-08-29 (Feedback):** Мгновенная мягкая подсветка в процессе + подробный Debrief с кнопкой «Исправить ошибки» в конце спринта.
- **2026-08-29 (Tech):** PocketBase в качестве бэкенда с Local-First кэшированием (деплой клиента на GitHub Pages с выводом в iOS через Capacitor).
- **2026-08-29 (Feature):** Добавлен встроенный оффлайн-справочник грамматики (Aide-Mémoire).

## Next Action
- Запустить реализацию первого сквозного **Tracer Bullet** в кодовой базе.