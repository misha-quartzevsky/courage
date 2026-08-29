import type { LearnerPersona, ProfessionId } from './types'

// Два фиксированных профиля вместо «умного онбординга со свободным текстом».
// Пока 30% персонализация кормится из готовых пресетов — AI-тегирование добавим
// только если понадобится более одного-двух профилей.
export const PERSONAS: Record<ProfessionId, LearnerPersona> = {
  surgeon: {
    id: 'surgeon',
    label: 'Витреоретинальный хирург',
    professionFr: 'chirurgien vitréo-rétinien',
    interestsFr: ['Ski alpin', 'Boxe pieds-poings'],
    domainTags: ['vitrectomie', 'décollement de la rétine', 'bloc opératoire'],
  },
  marketer: {
    id: 'marketer',
    label: 'Продуктовый маркетолог',
    professionFr: 'product marketer en startup',
    interestsFr: ['Ski alpin', 'Boxe pieds-poings'],
    domainTags: ['pitch', 'go-to-market', 'croissance', 'onboarding'],
  },
}

export const PERSONA_LIST = Object.values(PERSONAS)