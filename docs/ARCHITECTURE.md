# ARCHITECTURE.md — Courage

## System Context & Clean Architecture

Архитектура строго разделена на слои. Зависимости направлены **внутрь**:
`UI (React 19 / Tailwind) -> Adapters / Controllers -> Use Cases -> Domain Entities`
┌─────────────────────────────────────────────────────────────┐
│ Frameworks & Drivers (Outer Layer) │
│ - React 19 UI / Tailwind CSS / shadcn / Lucide │
│ - Capacitor 6 (iOS Haptics, Permissions, Native Audio) │
│ - PocketBase Client (SDK / Local-First SQLite) │
│ - Google Gemini 1.5 Flash API (Structured JSON) │
└──────────────────────────────┬──────────────────────────────┘
│ (implements)
┌──────────────────────────────▼──────────────────────────────┐
│ Adapters & Gateways │
│ - GeminiCurriculumAdapter implements ILLMGateway │
│ - PocketBaseRepository implements IProfileRepository │
│ - WebAudioEngine implements IAudioService │
│ - LocalStorageCacheAdapter implements ICacheService │
└──────────────────────────────┬──────────────────────────────┘
│ (calls via Ports)
┌──────────────────────────────▼──────────────────────────────┐
│ Use Cases (Application Layer) │
│ - GeneratePersonalizedSprintUseCase │
│ - EvaluateVoiceAnswerUseCase │
│ - EvaluateSilentAnswerUseCase │
│ - SyncPartnerProgressUseCase │
└──────────────────────────────┬──────────────────────────────┘
│ (manipulates)
┌──────────────────────────────▼──────────────────────────────┐
│ Core Domain Entities & Rules (Pure TypeScript) │
│ - LearnerPersona (Profession, Hobbies, CEFRLevel) │
│ - EditoSyllabusTree (GrammarMatrix, 70/30 weighting) │
│ - SprintSession (Aggregate Root: Dialogue, Challenges) │
│ - EvaluationVerdict (Accuracy, Feedback, Corrections) │
└─────────────────────────────────────────────────────────────┘
code Code

---

## Directory Structure (Classic 3-Tier)

src/
├── domain/ # Чистые сущности, типы, грамматические инварианты
│ ├── persona.ts
│ ├── syllabus.ts
│ ├── sprint.ts
│ └── evaluation.ts
├── core/ # Use Cases и интерфейсы шлюзов (Ports)
│ ├── ports/
│ │ ├── llm.gateway.ts
│ │ ├── repository.port.ts
│ │ └── audio.service.ts
│ └── usecases/
│ ├── generate-sprint.usecase.ts
│ └── evaluate-answer.usecase.ts
├── adapters/ # Реализации внешних систем
│ ├── gemini/
│ ├── pocketbase/
│ └── audio/
└── ui/ # Компоненты интерфейса
├── components/
├── hooks/
└── screens/
code Code

---

## Deep Modules Specification

1. **`CurriculumEngine`:**
   - Единый метод `generateSprint(persona: LearnerPersona, unitId: string): Promise<SprintSession>`.
   - Внутри: наложение 70% базы Édito + 30% терминологии/хобби, промпт-инжиниринг, санитизация JSON.
2. **`VoiceCockpitController` (`useVoiceCockpit`):**
   - Интерфейс: `{ isRecording, audioLevel, transcript, feedback, start(), stop() }`.
   - Внутри: Web Audio API, буферизация, Base64 кодирование, обработка микрофонных прав.
3. **`GrammarCodex` (Aide-Mémoire):**
   - Интерфейс: `getRule(ruleId)`, `searchRules(query)`.
   - Внутри: локальный оффлайн-справочник правил и таблиц спряжений.

---

## Data & Storage Decisions (PocketBase Schema)
- `profiles`: `user_id`, `partner_id`, `profession`, `hobbies` (json), `target_level`, `streak_count`, `xp`.
- `sprint_sessions`: `user_id`, `unit_id`, `mode`, `payload` (json), `evaluation` (json), `score`, `status`.

## The Not-Yet List (Сознательно отложено)
- **Нет векторной БД:** Каталог Édito статичен и типизирован в JSON.
- **Нет Redis:** Нагрузка обрабатывается SQLite в памяти PocketBase.
- **Нет очередей сообщений:** Запросы к Gemini 1.5 Flash выполняются за 300–600 мс в прямом асинхронном вызове.