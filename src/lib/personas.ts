import type { LearnerPersona } from './types'

// Демо-дефолты для режима без Supabase (нет логина — нет профиля).
// В обычном режиме контекст собирается из профиля пользователя (онбординг),
// а не выбирается из этого списка.
export const DEMO_PERSONA: LearnerPersona = {
  professionFr: 'chirurgien vitréo-rétinien',
  interestsFr: ['ski alpin', 'boxe pieds-poings', 'gastronomie'],
  domainTags: ['vitrectomie', 'décollement de la rétine', 'bloc opératoire'],
}
