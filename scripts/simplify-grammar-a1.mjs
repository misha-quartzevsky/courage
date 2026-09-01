// Разовый патч: упрощение объяснений грамматики, батч A1 (33 правила).
// Добавляет plain_ru («в двух словах») и переписывает summary_ru / formation_rule
// короткими предложениями, по одной мысли на строку.
// НЕ трогает authentic_examples и ключи key_exceptions.
//
//   node scripts/simplify-grammar-a1.mjs
//
// Идемпотентен: просто перезаписывает поля из PATCH по id.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../grammar-rules-A1-A2-B1.json',
)

const nl = (...lines) => lines.join('\n')

const PATCH = {
  'a1-u1-verbes-etre-avoir': {
    plain_ru: 'Два самых нужных глагола: être — «быть» (кто я, какой я), avoir — «иметь» (что у меня есть, сколько мне лет).',
    summary_ru: nl(
      'être — про то, кто вы и какой вы: профессия, национальность, состояние.',
      'avoir — про то, что у вас есть, и про возраст.',
    ),
    formation_rule: nl(
      'Оба глагола неправильные — формы просто заучиваем.',
      'Возраст по-французски через avoir: «у меня 30 лет».',
    ),
  },
  'a1-u1-adjectifs-nationalite': {
    plain_ru: 'Слово о национальности меняет окончание под мужчину или женщину.',
    summary_ru: 'Прилагательное национальности подстраивается под того, о ком речь: мужчина или женщина.',
    formation_rule: nl(
      'Женский род: к мужской форме добавляем -e (espagnol → espagnole).',
      'Если мужская форма на -ien / -éen, в женском роде удваиваем n: -ienne / -éenne.',
      'Если мужская форма уже на -e, женская такая же.',
    ),
  },
  'a1-u1-articles-definis': {
    plain_ru: 'le / la / les — «этот самый», предмет уже известен или речь о нём вообще.',
    summary_ru: 'Определённый артикль ставим, когда предмет конкретный, уже известный или когда говорим о явлении в целом.',
    formation_rule: nl(
      'Мужской род: le.',
      'Женский род: la.',
      'Перед гласной или немой h: l’.',
      'Множественное число (любой род): les.',
    ),
  },
  'a1-u1-prepositions-villes-pays': {
    plain_ru: 'Куда/где: в город — à, в страну — en, au или aux в зависимости от рода страны.',
    summary_ru: 'Предлог перед местом зависит от того, город это или страна, и какого страна рода.',
    formation_rule: nl(
      'Город: à (à Paris).',
      'Страна женского рода (на -e) или на гласную: en (en France).',
      'Страна мужского рода: au (au Canada).',
      'Страна во множественном числе: aux (aux États-Unis).',
    ),
  },
  'a1-u1-adjectif-quel': {
    plain_ru: 'quel — «какой / который» в вопросе; меняет окончание под существительное.',
    summary_ru: 'quel в вопросе подстраивается под существительное по роду и числу. Все четыре формы звучат одинаково.',
    formation_rule: nl(
      'Мужской род, ед. ч.: quel.',
      'Женский род, ед. ч.: quelle.',
      'Мужской род, мн. ч.: quels.',
      'Женский род, мн. ч.: quelles.',
    ),
  },
  'a1-u2-articles-indefinis': {
    plain_ru: 'un / une / des — «какой-то», предмет новый или неважно какой именно.',
    summary_ru: 'Неопределённый артикль ставим, когда предмет называем впервые или он не конкретный.',
    formation_rule: nl(
      'Мужской род: un.',
      'Женский род: une.',
      'Множественное число (любой род): des.',
    ),
  },
  'a1-u2-verbes-er-present': {
    plain_ru: 'Самые частые глаголы (на -er): убираем -er и добавляем нужное окончание.',
    summary_ru: 'Глаголы на -er — самая большая группа. Спрягаются все одинаково, по одному правилу.',
    formation_rule: nl(
      'Убираем -er от инфинитива, к основе добавляем:',
      'je → -e, tu → -es, il/elle/on → -e,',
      'nous → -ons, vous → -ez, ils/elles → -ent.',
      'Окончания -e, -es, -ent не слышны — на слух эти формы одинаковые.',
    ),
  },
  'a1-u2-adjectifs-possessifs': {
    plain_ru: 'mon / ma / mes — «мой»; форма зависит от рода и числа предмета, а не хозяина.',
    summary_ru: nl(
      'Показывают, чьё это.',
      'Важно: форма зависит от самого предмета (род, число), а не от владельца, как в русском.',
    ),
    formation_rule: nl(
      'je: mon (м.р.) / ma (ж.р.) / mes (мн. ч.).',
      'tu: ton / ta / tes.',
      'il, elle: son / sa / ses.',
      'nous: notre / nos. vous: votre / vos. ils, elles: leur / leurs.',
    ),
  },
  'a1-u2-masculin-feminin-professions': {
    plain_ru: 'У большинства профессий есть мужская и женская форма — меняется окончание.',
    summary_ru: 'Профессия обычно имеет две формы. Какая будет женская — зависит от окончания мужской.',
    formation_rule: nl(
      '-e → без изменений (fleuriste → fleuriste).',
      '-er → -ère (infirmier → infirmière).',
      '-eur → -euse (coiffeur → coiffeuse).',
      '-teur → -trice (acteur → actrice).',
      '-ien → -ienne. В остальных случаях просто добавляем -e.',
    ),
  },
  'a1-u3-singulier-pluriel-noms': {
    plain_ru: 'Множественное число обычно = слово + непроизносимая -s.',
    summary_ru: 'Множественное число существительных чаще всего образуется добавлением -s, которая не читается.',
    formation_rule: nl(
      'Обычно: + s (un panier → des paniers).',
      'На слух единственное и множественное часто различаются только артиклем (un / des, le / les).',
    ),
  },
  'a1-u3-articles-partitifs': {
    plain_ru: 'du / de la / des — «немного, часть чего-то»: еда, вода, абстрактные вещи.',
    summary_ru: 'Частичный артикль ставим перед тем, что не считают поштучно (еда, жидкости, чувства), чтобы сказать «сколько-то».',
    formation_rule: nl(
      'Мужской род: du. Женский род: de la.',
      'Перед гласной: de l’. Множественное число: des.',
      'После слов количества (un peu, beaucoup) и при отрицании — просто de / d’.',
    ),
  },
  'a1-u3-prepositions-lieu-1': {
    plain_ru: 'К человеку — chez, в заведение или место — à (au / à la / aux).',
    summary_ru: 'Выбор предлога зависит от того, идёте вы к человеку или в какое-то место.',
    formation_rule: nl(
      'chez — перед людьми и профессиями (chez le médecin, chez moi).',
      'à (+ артикль: au, à la, à l’, aux) — перед местами и заведениями (au marché, à la boulangerie).',
    ),
  },
  'a1-u4-c-est-il-est': {
    plain_ru: 'C’est — «это (такой-то)», называем; Il/Elle est — «он/она такой», описываем.',
    summary_ru: 'C’est — чтобы назвать, что или кто это. Il/Elle est — чтобы описать уже названного человека или предмет.',
    formation_rule: nl(
      'C’est + существительное с артиклем (C’est un artiste).',
      'Il/Elle est + прилагательное или профессия без артикля (Elle est calme, Il est médecin).',
      'Множественное число: Ce sont + существительное, Ils/Elles sont + прилагательное.',
    ),
  },
  'a1-u4-frequence-1': {
    plain_ru: 'Как часто (souvent, toujours, jamais) — сразу после глагола.',
    summary_ru: 'Наречия частоты показывают, как часто происходит действие, и стоят сразу после глагола.',
    formation_rule: nl(
      'Порядок: подлежащее + глагол + наречие частоты (Je regarde souvent la télé).',
      '«Никогда» — это ne… jamais вокруг глагола, без pas.',
    ),
  },
  'a1-u4-imperatif': {
    plain_ru: 'Просьба или команда: берём форму настоящего времени и убираем «ты / мы / вы».',
    summary_ru: 'Повелительное наклонение — для просьб, советов и инструкций. Три формы, местоимение не ставим.',
    formation_rule: nl(
      'Берём формы настоящего времени для tu, nous, vous и убираем местоимение.',
      'У глаголов на -er в форме tu убираем конечную -s (Tu regardes → Regarde !).',
    ),
  },
  'a1-u4-connecteurs': {
    plain_ru: 'Слова-связки: pour (зачем), parce que (почему), mais (но), avec / sans (с / без).',
    summary_ru: 'Связки соединяют части фразы: цель, причину, противопоставление, наличие или отсутствие.',
    formation_rule: nl(
      'pour + инфинитив — цель (pour apprendre).',
      'parce que + целое предложение — причина.',
      'mais + предложение — противопоставление.',
      'avec / sans + существительное.',
    ),
  },
  'a1-u5-adjectifs-genre-nombre-place': {
    plain_ru: 'Прилагательное согласуется с существительным; чаще стоит после него, короткие частые — перед.',
    summary_ru: 'Прилагательное подстраивается под существительное по роду и числу. Обычно оно после существительного, но несколько коротких частых слов — перед.',
    formation_rule: nl(
      'Женский род: + e. Множественное число: + s.',
      'Перед существительным: petit, grand, beau, bon, joli и ещё несколько коротких.',
      'Цвета и национальности — всегда после существительного.',
    ),
  },
  'a1-u5-futur-proche': {
    plain_ru: 'Скоро сделаю = aller в настоящем времени + инфинитив.',
    summary_ru: 'Ближайшее будущее — про то, что произойдёт скоро или уже запланировано.',
    formation_rule: nl(
      'aller в настоящем времени + инфинитив основного глагола.',
      'Je vais manger. Tu vas partir. Nous allons voir.',
    ),
  },
  'a1-u5-adjectif-demonstratif': {
    plain_ru: 'ce / cette / ces — «этот, эта, эти»; ставим вместо артикля.',
    summary_ru: 'Указательное прилагательное показывает на конкретный предмет («вот этот») и заменяет артикль.',
    formation_rule: nl(
      'Мужской род, ед. ч.: ce (ce sac).',
      'Женский род, ед. ч.: cette (cette robe).',
      'Множественное число (любой род): ces (ces objets).',
    ),
  },
  'a1-u6-verbes-pronominaux-present': {
    plain_ru: 'Глаголы с se (умываться, вставать): частица меняется под лицо и стоит перед глаголом.',
    summary_ru: 'У возвратных глаголов есть частица se. Она меняется вместе с подлежащим.',
    formation_rule: nl(
      'je me, tu te, il/elle se, nous nous, vous vous, ils/elles se.',
      'Отрицание: ne — перед частицей (Je ne me lève pas).',
    ),
  },
  'a1-u6-passe-recent': {
    plain_ru: 'Только что сделал = venir в настоящем времени + de + инфинитив.',
    summary_ru: 'Недавнее прошедшее — про действие, которое случилось буквально минуту назад.',
    formation_rule: nl(
      'venir в настоящем времени + de (d’) + инфинитив.',
      'Je viens de finir. Elle vient d’arriver.',
    ),
  },
  'a1-u7-passe-compose-avoir': {
    plain_ru: 'Прошедшее «сделал» = avoir в настоящем времени + причастие (у -er глаголов на -é).',
    summary_ru: 'Passé composé — основное прошедшее время про завершённое действие. Большинство глаголов берут avoir.',
    formation_rule: nl(
      'avoir в настоящем времени + причастие прошедшего времени.',
      'У глаголов на -er причастие оканчивается на -é (trouver → trouvé).',
      'J’ai trouvé. Nous avons mangé.',
    ),
  },
  'a1-u7-prepositions-lieu-2': {
    plain_ru: 'Где именно: sur, sous, devant, derrière, entre и обороты с de (à côté de…).',
    summary_ru: 'Предлоги и обороты для точного места предмета в пространстве.',
    formation_rule: nl(
      'sur (на), sous (под), devant (перед), derrière (за), entre (между).',
      'Обороты с de: à gauche de, à droite de, à côté de, en face de.',
      'Помним: de + le = du, de + les = des.',
    ),
  },
  'a1-u7-pronoms-cod-1': {
    plain_ru: 'le / la / les заменяют предмет или человека (кого? что?), чтобы не повторяться. Ставим перед глаголом.',
    summary_ru: 'Прямое местоимение заменяет существительное без предлога (кого? что?) и убирает повтор.',
    formation_rule: nl(
      'le (м.р.), la (ж.р.), l’ (перед гласной), les (мн. ч.).',
      'Ставим перед глаголом: Je le connais.',
      'Отрицание: Je ne le connais pas.',
    ),
  },
  'a1-u8-passe-compose-etre': {
    plain_ru: 'Глаголы движения в прошедшем берут être, и причастие согласуется с подлежащим.',
    summary_ru: nl(
      'Глаголы движения и смены состояния в passé composé берут être.',
      'Тогда причастие согласуется с подлежащим по роду и числу.',
    ),
    formation_rule: nl(
      'être в настоящем времени + причастие.',
      'Согласование: + e (ж.р.), + s (мн. ч.), + es (ж.р. мн. ч.).',
      'Неправильные причастия учим отдельно: être → été, avoir → eu, faire → fait, prendre → pris, voir → vu.',
    ),
  },
  'a1-u8-pronom-y': {
    plain_ru: 'y заменяет место («туда / там»), чтобы не повторять à / dans + место.',
    summary_ru: 'y заменяет обстоятельство места с предлогами à, dans, en и т. п.',
    formation_rule: nl(
      'Ставим перед глаголом (J’y vais).',
      'В отрицании ne + y сливаются: Je n’y vais pas.',
    ),
  },
  'a1-u8-obligation-devoir': {
    plain_ru: 'Надо: il faut + инфинитив (общее правило) или devoir по лицам (лично должен).',
    summary_ru: 'il faut — безличное «нужно» для общих правил. devoir — «быть должным», спрягается по лицам.',
    formation_rule: nl(
      'il faut + инфинитив (одна форма на всех).',
      'devoir: je dois, tu dois, il doit, nous devons, vous devez, ils doivent + инфинитив.',
      'В отрицании обе конструкции означают запрет.',
    ),
  },
  'a1-u9-comparaison': {
    plain_ru: 'Сравнение: plus / moins / aussi + прилагательное + que («больше / меньше / так же… чем»).',
    summary_ru: 'Конструкции сравнения работают с прилагательными (какой) и с количеством (сколько).',
    formation_rule: nl(
      'С прилагательным: plus / moins / aussi + прилагательное + que.',
      'С существительным: plus de / moins de + существительное + que.',
      'que перед гласной → qu’.',
    ),
  },
  'a1-u9-imparfait-impersonnel': {
    plain_ru: 'Описание прошлого (погода, фон): c’était, il y avait, il faisait.',
    summary_ru: 'Imparfait описывает фон и обстановку в прошлом. У безличных оборотов только одна форма.',
    formation_rule: nl(
      'c’est → c’était (это было).',
      'il y a → il y avait (там было / находилось).',
      'il fait (о погоде) → il faisait.',
    ),
  },
  'a1-u10-pronoms-cod-2': {
    plain_ru: 'me / te / nous / vous — «меня, тебя, нас, вас»; перед глаголом.',
    summary_ru: 'Эти местоимения обозначают человека, на которого направлено действие, без предлога.',
    formation_rule: nl(
      'me (меня), te (тебя), nous (нас), vous (вас).',
      'Ставим перед глаголом.',
      'Перед гласной: me → m’, te → t’.',
    ),
  },
  'a1-u10-pronoms-relatifs': {
    plain_ru: 'qui / que соединяют два предложения в одно: qui — вместо подлежащего, que — вместо дополнения.',
    summary_ru: 'Относительные местоимения связывают две мысли в одну фразу без повтора существительного.',
    formation_rule: nl(
      'qui — вместо подлежащего, дальше сразу глагол (l’ami qui parle).',
      'que — вместо дополнения, дальше подлежащее + глагол (le livre que je lis).',
      'que перед гласной → qu’.',
    ),
  },
  'a1-u11-duree-continuation': {
    plain_ru: 'Сколько времени длилось: pendant (точный срок), longtemps (долго), toujours + настоящее (всё ещё идёт).',
    summary_ru: 'Слова для выражения того, сколько длится действие.',
    formation_rule: nl(
      'pendant + существительное — ограниченный срок (pendant deux ans).',
      'longtemps — долго, без точного срока.',
      'toujours + настоящее время — действие началось раньше и всё ещё идёт.',
    ),
  },
  'a1-u12-pronoms-coi-lui-leur': {
    plain_ru: 'lui / leur — «ему/ей, им»: заменяют людей после предлога à (кому?).',
    summary_ru: 'Косвенные местоимения заменяют людей, которых вводит предлог à (кому?).',
    formation_rule: nl(
      'lui — один человек (и он, и она): ему, ей.',
      'leur — несколько человек: им.',
      'Ставим перед глаголом (Je lui parle).',
    ),
  },
}

// Точечная правка сырого текста: у исходного файла нестандартное форматирование
// (объекты развёрнуты без отступов, массивы строк — инлайн), поэтому НЕ
// пересериализуем весь файл — меняем только нужные строки нужных правил.
// Значения summary_ru / formation_rule / plain_ru не содержат кавычек и переводов
// строк, поэтому каждое поле — ровно одна строка вида `"field": "value"`.

const raw = readFileSync(FILE, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r?\n/)

const q = (s) => JSON.stringify(s) // экранирование + кавычки, \n -> \\n

let currentId = null
let touchedIds = new Set()
const out = []
for (const line of lines) {
  const idm = line.match(/^"id":\s*"([^"]+)"/)
  if (idm) currentId = idm[1]

  const patch = currentId && PATCH[currentId]
  if (patch && /^"summary_ru":\s*"/.test(line)) {
    out.push(`"summary_ru": ${q(patch.summary_ru)},`)
    out.push(`"plain_ru": ${q(patch.plain_ru)},`)
    touchedIds.add(currentId)
    continue
  }
  if (patch && /^"formation_rule":\s*"/.test(line)) {
    out.push(`"formation_rule": ${q(patch.formation_rule)},`)
    continue
  }
  out.push(line)
}

writeFileSync(FILE, out.join(eol))
// Проверка: файл всё ещё валидный JSON и все правила на месте.
const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
console.log(
  `Патч: ${touchedIds.size}/${Object.keys(PATCH).length} правил A1, всего правил ${parsed.length}.`,
)
