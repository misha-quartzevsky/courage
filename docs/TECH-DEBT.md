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