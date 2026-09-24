// Recompute SlayQL's decisions from per-question evaluation results.
// Each question: { p, ok, expected, blocked, clarify, b0_answered, b0_correct }.

export const thresholdFor = (penalty) => (penalty <= 0 ? 0 : penalty / (1 + penalty));

export function outcomesAt(questions, penalty) {
  const t = thresholdFor(penalty);
  let answered = 0;
  let wrong = 0;
  let deferred = 0;
  let plainWrong = 0;
  let plainAnswered = 0;
  for (const q of questions) {
    const slayqlAnswers = !q.blocked && !q.clarify && q.p >= t;
    if (slayqlAnswers) {
      answered += 1;
      if (q.expected !== 'answer' || !q.ok) wrong += 1;
    } else {
      deferred += 1;
    }
    if (q.b0_answered) {
      plainAnswered += 1;
      if (!q.b0_correct) plainWrong += 1;
    }
  }
  const n = questions.length || 1;
  const per100 = (value) => Math.round((value / n) * 1000) / 10;
  return {
    threshold: t,
    n: questions.length,
    slayql: { answered: per100(answered), wrong: per100(wrong), deferred: per100(deferred) },
    plain: { answered: per100(plainAnswered), wrong: per100(plainWrong) },
  };
}

// "Your company" calculator: the audience's inputs combined with measured rates.
export function companyEstimate({ questionsPerWeek, minutesPerQuestion }, rates) {
  const perMonth = questionsPerWeek * 4.33;
  const safeRate = Math.max(0, (rates.slayql.answered - rates.slayql.wrong) / 100);
  const handoffRate = rates.slayql.deferred / 100;
  const fewerWrong = Math.max(0, (rates.plain.wrong - rates.slayql.wrong) / 100);
  return {
    questionsPerMonth: Math.round(perMonth),
    analystHoursReleased: Math.round(((perMonth * safeRate * minutesPerQuestion) / 60) * 10) / 10,
    handoffsPerMonth: Math.round(perMonth * handoffRate),
    fewerWrongNumbersPerMonth: Math.round(perMonth * fewerWrong * 10) / 10,
  };
}
