# TESTING.md — Courage

## Test Strategy & Pyramid

code Code

▲
   / \        E2E / Smoke Tests (10%) — Прохождение полного спринта в UI
  /───\
 /     \      Integration Tests (20%) — Gemini JSON Adapter & PocketBase Adapter
/───────\

/ \ Unit Tests (70%) — Доменные сущности, инварианты, Use Cases
/───────────\
code Code

- **Tooling:** **Vitest** (быстрый раннер для Vite/TypeScript), `@testing-library/react`.
- **Fakes & Mocks:** `FakeLLMGateway` (возвращает детерминированные фикстуры уроков за 2 мс), `InMemorySprintRepository`.

---

## Safety Net Map

| Модуль | Проверяемое поведение (Behavior-Driven Tests) | Файл теста |
|:---|:---|:---|
| `SprintSession` | `shouldPreserveStateWhenTogglingBetweenVoiceAndSilent` | `sprint.spec.ts` |
| `CurriculumEngine` | `shouldEnforce70BaseAnd30InterestDistribution` | `curriculum.spec.ts` |
| `CurriculumEngine` | `shouldInjectSurgeryAndSkiingLexiconIntoEditoGrammar` | `curriculum.spec.ts` |
| `EvaluateAnswer` | `shouldProvideInstantSoftCorrectionWithoutTerminatingSession` | `evaluate.spec.ts` |
| `EvaluateAnswer` | `shouldAggregateAllMistakesForDebriefRetryScreen` | `evaluate.spec.ts` |

---

## CI & Pre-Commit Quality Gate
Перед каждым коммитом через Git Hooks автоматически запускаются:
1. `tsc --noEmit` — строгая проверка типов TypeScript без генерации бандла.
2. `vitest run` — прогон всех юнит-тестов (время выполнения < 2 секунд).

7. docs/TECH-DEBT.md
code Markdown

# TECH-DEBT.md — Courage

## Debt Budget & Broken-Windows Policy
1. **Zero Silent Rot (Никаких скрытых костылей):** 
   - Любое временное упрощение при вайбкодинге обязано сопровождаться комментарием:
     `// TODO(debt): [причина и что нужно сделать для полноценного решения]`
   - Каждая такая строка регистрируется в `Smell Inventory`.
2. **Strict Boundary Defense:**
   - Запрещено вызывать SDK PocketBase или Gemini напрямую из UI-компонентов.
3. **Strategic 10-20% Rule:**
   - Не экономить время на структуре доменных типов — инвестировать 10–20% усилий в чистоту интерфейсов глубоких модулей.

---

## Smell Inventory (Реестр технического долга)

| Запах / Упрощение | Локация | План рефакторинга | Статус |
|:---|:---|:---|:---|
| Mock Audio Input | `adapters/audio/` | Подключение нативного Capacitor Voice Recorder для iOS | `planned` |
| LocalStorage Fallback | `adapters/pocketbase/` | Синхронизация локальных сессий при появлении сети | `planned` |