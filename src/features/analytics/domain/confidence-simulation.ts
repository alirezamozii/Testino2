import { formatSignedPercentString } from "@/components/ui/signed-number";
import { buildScoringGroups } from "@/features/profiles/domain/score-groups";

/**
 * Confidence Simulation Engine for Sanjesh Konkur Scoring
 *
 * Konkur Scoring Rules:
 * - Raw percentage: P = [(3 * Correct) - Wrong] / (3 * TotalQuestions) * 100
 * - Per correct question value: +100 / N %
 * - Per wrong question penalty: -100 / (3 * N) %
 * - 3 wrong answers eliminate 1 correct answer (3 * 100/(3N) = 100/N)
 * - Break-even accuracy for 4 options with -1/3 penalty: 25%
 * - Coefficient (ضریب) scales the weighted impact on overall Konkur rank/traz,
 *   while mistakes in one subject never subtract marks from another subject.
 */

export type ConfidenceLevel = "sure" | "doubtful" | "guess" | null;
export type QuestionResult = "correct" | "wrong" | "unanswered";

export interface QuestionAttemptForSimulation {
  subject: string;
  result: QuestionResult;
  confidence?: ConfidenceLevel;
}

export interface SubjectConfig {
  name: string;
  coefficient: number;
  targetPercentage?: number;
  questionCount?: number;
  scoreGroup?: string | null;
}

export interface ConfidenceStats {
  count: number;
  correct: number;
  wrong: number;
  accuracy: number; // 0 - 100%
}

export interface SubjectConfidenceSimulation {
  subject: string;
  coefficient: number;
  targetPercentage: number;
  questionCount: number;
  scoreGroup: string | null;
  pointValuePerCorrect: number; // e.g. +4% for 25 questions
  penaltyPerWrong: number; // e.g. -1.33% for 25 questions

  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;

  sure: ConfidenceStats;
  doubtful: ConfidenceStats & {
    netPercentageImpact: number;
    weightedImpact: number;
  };
  guess: ConfidenceStats & {
    netPercentageImpact: number;
    weightedImpact: number;
  };

  actualPercentage: number;
  percentageWithoutDoubt: number;
  percentageWithoutGuess: number;
  percentageOnlySure: number;

  doubtfulBenefit: "positive" | "negative" | "neutral" | "no_data";
  guessBenefit: "positive" | "negative" | "neutral" | "no_data";

  strategicAdvice: {
    doubtfulAdvice: string;
    guessAdvice: string;
    overallSubjectAdvice: string;
    recommendationTag: "trust_doubt" | "avoid_doubt" | "avoid_guess" | "balanced" | "need_more_data";
    recommendationLabel: string;
  };
}

export interface OverallConfidenceSimulation {
  subjects: SubjectConfidenceSimulation[];
  totals: {
    totalAttempts: number;
    totalCorrect: number;
    totalWrong: number;
    overallActualPercentage: number;
    overallWithoutDoubt: number;
    overallWithoutGuess: number;
    overallOnlySure: number;
    totalDoubtfulNetGain: number;
    totalGuessNetGain: number;
  };
  topRecommendation: string;
}

function roundTo1(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundTo2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function calculateRawPercentage(correct: number, wrong: number, total: number): number {
  if (total <= 0) return 0;
  const raw = ((3 * correct - wrong) / (3 * total)) * 100;
  return roundTo1(raw);
}

export function simulateSubjectConfidence(
  attempts: QuestionAttemptForSimulation[],
  config: SubjectConfig
): SubjectConfidenceSimulation {
  const subject = config.name;
  const coefficient = Math.max(0, config.coefficient ?? 1);
  const targetPercentage = config.targetPercentage ?? 70;
  const questionCount = Math.max(1, config.questionCount ?? 25);
  const scoreGroup = config.scoreGroup?.trim() || null;

  const pointValuePerCorrect = roundTo2(100 / questionCount);
  const penaltyPerWrong = roundTo2(100 / (3 * questionCount));

  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;

  const sure = { count: 0, correct: 0, wrong: 0, accuracy: 0 };
  const doubtful = { count: 0, correct: 0, wrong: 0, accuracy: 0, netPercentageImpact: 0, weightedImpact: 0 };
  const guess = { count: 0, correct: 0, wrong: 0, accuracy: 0, netPercentageImpact: 0, weightedImpact: 0 };

  for (const a of attempts) {
    if (a.result === "unanswered") {
      totalUnanswered += 1;
      continue;
    }

    const isCorrect = a.result === "correct";
    if (isCorrect) totalCorrect += 1;
    else totalWrong += 1;

    if (a.confidence === "sure") {
      sure.count += 1;
      if (isCorrect) sure.correct += 1;
      else sure.wrong += 1;
    } else if (a.confidence === "doubtful") {
      doubtful.count += 1;
      if (isCorrect) doubtful.correct += 1;
      else doubtful.wrong += 1;
    } else if (a.confidence === "guess") {
      guess.count += 1;
      if (isCorrect) guess.correct += 1;
      else guess.wrong += 1;
    }
  }

  const totalAttempts = attempts.length;

  sure.accuracy = sure.count > 0 ? Math.round((sure.correct / sure.count) * 100) : 0;
  doubtful.accuracy = doubtful.count > 0 ? Math.round((doubtful.correct / doubtful.count) * 100) : 0;
  guess.accuracy = guess.count > 0 ? Math.round((guess.correct / guess.count) * 100) : 0;

  const denominator = totalAttempts > 0 ? totalAttempts : questionCount;

  // Actual percentage
  const actualPercentage = calculateRawPercentage(totalCorrect, totalWrong, denominator);

  // Without doubtful: subtract doubtful answers (they become 0 score instead of (3R - W))
  const withoutDoubtCorrect = totalCorrect - doubtful.correct;
  const withoutDoubtWrong = totalWrong - doubtful.wrong;
  const percentageWithoutDoubt = calculateRawPercentage(withoutDoubtCorrect, withoutDoubtWrong, denominator);

  // Without guesses: subtract guess answers
  const withoutGuessCorrect = totalCorrect - guess.correct;
  const withoutGuessWrong = totalWrong - guess.wrong;
  const percentageWithoutGuess = calculateRawPercentage(withoutGuessCorrect, withoutGuessWrong, denominator);

  // Only sure: remove doubtful and guess
  const percentageOnlySure = calculateRawPercentage(sure.correct, sure.wrong, denominator);

  // Net percentage impact: actual - simulated without that group
  doubtful.netPercentageImpact = roundTo1(actualPercentage - percentageWithoutDoubt);
  doubtful.weightedImpact = roundTo1(doubtful.netPercentageImpact * coefficient);

  guess.netPercentageImpact = roundTo1(actualPercentage - percentageWithoutGuess);
  guess.weightedImpact = roundTo1(guess.netPercentageImpact * coefficient);

  // Benefit classification
  const doubtfulBenefit: SubjectConfidenceSimulation["doubtfulBenefit"] =
    doubtful.count === 0
      ? "no_data"
      : doubtful.netPercentageImpact > 0
      ? "positive"
      : doubtful.netPercentageImpact < 0
      ? "negative"
      : "neutral";

  const guessBenefit: SubjectConfidenceSimulation["guessBenefit"] =
    guess.count === 0
      ? "no_data"
      : guess.netPercentageImpact > 0
      ? "positive"
      : guess.netPercentageImpact < 0
      ? "negative"
      : "neutral";

  // Persian Strategic Guidance
  let doubtfulAdvice = "";
  if (doubtful.count === 0) {
    doubtfulAdvice = "هنوز سؤالی با علامت شک‌دار در این درس ثبت نشده است.";
  } else if (doubtfulBenefit === "positive") {
    doubtfulAdvice = `دقت شک‌های شما ${doubtful.accuracy}٪ بوده و اثر مثبت (${formatSignedPercentString(doubtful.netPercentageImpact, true)}) بر درصد این درس داشته است. به شک‌های ۵۰-۵۰ خود در این درس اعتماد کنید.`;
  } else if (doubtfulBenefit === "negative") {
    doubtfulAdvice = `پاسخ به سؤالات شک‌دار باعث نمره منفی و کاهش درصد شما (${formatSignedPercentString(doubtful.netPercentageImpact, false)}) شده است. تا اطمینان نسبی پیدا نکرده‌اید، گزینه‌های مشکوک را علامت نزنید.`;
  } else {
    doubtfulAdvice = "پاسخ به سؤالات شک‌دار اثر خنثی داشته و سود یا زیان قابل توجهی ایجاد نکرده است.";
  }

  let guessAdvice = "";
  if (guess.count === 0) {
    guessAdvice = "سؤال حدسی در این درس ثبت نشده است.";
  } else if (guessBenefit === "negative") {
    guessAdvice = `حدس‌های شانسی نمره منفی آورده و درصد را ${formatSignedPercentString(Math.abs(guess.netPercentageImpact), false)} کاهش داده‌اند. در کنکور اکیداً از حدس تصادفی در این درس خودداری کنید.`;
  } else if (guessBenefit === "positive") {
    guessAdvice = `حدس‌های شانسی شما به طور تصادفی سود اندکی (${formatSignedPercentString(guess.netPercentageImpact, true)}) داشته‌اند، اما به دلیل ضریب ${coefficient} ریسک نمره منفی بالاست.`;
  } else {
    guessAdvice = "حدس‌ها اثر خنثی داشته‌اند؛ بهتر است وقت آزمون صرف سؤالات مطمئن شود.";
  }

  let overallSubjectAdvice = "";
  let recommendationTag: SubjectConfidenceSimulation["strategicAdvice"]["recommendationTag"] = "balanced";
  let recommendationLabel = "وضعیت متعادل";

  if (doubtful.count === 0 && guess.count === 0) {
    overallSubjectAdvice = `برای درس «${subject}»، هر پاسخ درست ${formatSignedPercentString(pointValuePerCorrect, true)} و هر پاسخ غلط ${formatSignedPercentString(-penaltyPerWrong, false)} ارزش دارد. در آزمون‌های بعدی میزان اطمینان خود را علامت بزنید.`;
    recommendationTag = "need_more_data";
    recommendationLabel = "نیاز به داده بیشتر";
  } else if (doubtfulBenefit === "positive" && guessBenefit !== "positive") {
    overallSubjectAdvice = `استراتژی بهینه برای «${subject}»: به شک‌های ۵۰-۵۰ اعتماد کن (${formatSignedPercentString(doubtful.netPercentageImpact, true)} سود خالص)، اما از حدس‌های شانسی دوری کن.`;
    recommendationTag = "trust_doubt";
    recommendationLabel = "به شک اعتماد کن";
  } else if (doubtfulBenefit === "negative" && guessBenefit === "negative") {
    overallSubjectAdvice = `استراتژی بهینه برای «${subject}»: نمره منفی شک و حدس به درصد شما ضربه می‌زند (${formatSignedPercentString(roundTo1(doubtful.netPercentageImpact + guess.netPercentageImpact), false)} کاهش). فقط به سؤالات مطمئن پاسخ بده.`;
    recommendationTag = "avoid_doubt";
    recommendationLabel = "فقط مطمئن‌ها را بزن";
  } else if (guessBenefit === "negative") {
    overallSubjectAdvice = `استراتژی بهینه برای «${subject}»: حدس‌های تصادفی به درصد آسیب زده است. حدس زدن را متوقف کن.`;
    recommendationTag = "avoid_guess";
    recommendationLabel = "حدس نزن";
  } else {
    overallSubjectAdvice = `عملکرد شما در «${subject}» مناسب است. درصد فعلی شما ${actualPercentage}٪ است و با حذف خطاهای ناشی از شک/حدس می‌تواند به ${percentageOnlySure}٪ برسد.`;
    recommendationTag = "balanced";
    recommendationLabel = "استراتژی متوازن";
  }

  return {
    subject,
    coefficient,
    targetPercentage,
    questionCount,
    scoreGroup,
    pointValuePerCorrect,
    penaltyPerWrong,

    totalAttempts,
    totalCorrect,
    totalWrong,
    totalUnanswered,

    sure,
    doubtful,
    guess,

    actualPercentage,
    percentageWithoutDoubt,
    percentageWithoutGuess,
    percentageOnlySure,

    doubtfulBenefit,
    guessBenefit,

    strategicAdvice: {
      doubtfulAdvice,
      guessAdvice,
      overallSubjectAdvice,
      recommendationTag,
      recommendationLabel,
    },
  };
}

export function simulateOverallConfidence(
  attempts: QuestionAttemptForSimulation[],
  subjectConfigs: SubjectConfig[]
): OverallConfidenceSimulation {
  const configMap = new Map(subjectConfigs.map((c) => [c.name, c]));
  const subjectNames = [
    ...new Set([...subjectConfigs.map((c) => c.name), ...attempts.map((a) => a.subject)]),
  ];

  const simulations: SubjectConfidenceSimulation[] = [];

  for (const name of subjectNames) {
    const subAttempts = attempts.filter((a) => a.subject === name);
    const cfg = configMap.get(name) || { name, coefficient: 1, targetPercentage: 70, questionCount: 25 };
    simulations.push(simulateSubjectConfidence(subAttempts, cfg));
  }

  let totalAttempts = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  for (const sim of simulations) {
    totalAttempts += sim.totalAttempts;
    totalCorrect += sim.totalCorrect;
    totalWrong += sim.totalWrong;
  }

  // First merge split study subjects that belong to one exam score group, then
  // apply that group's coefficient once. Groups without attempts are excluded
  // so missing practice data is not silently treated as a zero score.
  const simulationBySubject = new Map(simulations.map((simulation) => [simulation.subject, simulation]));
  const scoringGroups = buildScoringGroups(
    simulations.map((simulation) => ({
      name: simulation.subject,
      coefficient: simulation.coefficient,
      targetPercentage: simulation.targetPercentage,
      questionCount: simulation.questionCount,
      scoreGroup: simulation.scoreGroup,
    }))
  );
  let totalScoredCoefficient = 0;
  let weightedActual = 0;
  let weightedWithoutDoubt = 0;
  let weightedWithoutGuess = 0;
  let weightedOnlySure = 0;

  for (const group of scoringGroups) {
    const members = group.subjects
      .map((subject) => simulationBySubject.get(subject.name))
      .filter((simulation): simulation is SubjectConfidenceSimulation => Boolean(simulation));
    const denominator = members.reduce((sum, sim) => sum + sim.totalAttempts, 0);
    if (denominator <= 0) continue;

    const correct = members.reduce((sum, sim) => sum + sim.totalCorrect, 0);
    const wrong = members.reduce((sum, sim) => sum + sim.totalWrong, 0);
    const doubtfulCorrect = members.reduce((sum, sim) => sum + sim.doubtful.correct, 0);
    const doubtfulWrong = members.reduce((sum, sim) => sum + sim.doubtful.wrong, 0);
    const guessCorrect = members.reduce((sum, sim) => sum + sim.guess.correct, 0);
    const guessWrong = members.reduce((sum, sim) => sum + sim.guess.wrong, 0);
    const sureCorrect = members.reduce((sum, sim) => sum + sim.sure.correct, 0);
    const sureWrong = members.reduce((sum, sim) => sum + sim.sure.wrong, 0);

    totalScoredCoefficient += group.coefficient;
    weightedActual += calculateRawPercentage(correct, wrong, denominator) * group.coefficient;
    weightedWithoutDoubt += calculateRawPercentage(correct - doubtfulCorrect, wrong - doubtfulWrong, denominator) * group.coefficient;
    weightedWithoutGuess += calculateRawPercentage(correct - guessCorrect, wrong - guessWrong, denominator) * group.coefficient;
    weightedOnlySure += calculateRawPercentage(sureCorrect, sureWrong, denominator) * group.coefficient;
  }

  const weightedAverage = (value: number) => totalScoredCoefficient > 0 ? roundTo1(value / totalScoredCoefficient) : 0;
  const overallActualPercentage = weightedAverage(weightedActual);
  const overallWithoutDoubt = weightedAverage(weightedWithoutDoubt);
  const overallWithoutGuess = weightedAverage(weightedWithoutGuess);
  const overallOnlySure = weightedAverage(weightedOnlySure);

  // Top recommendation
  let topRecommendation = "";
  const negativeDoubtSubjects = simulations.filter((s) => s.doubtfulBenefit === "negative");
  const positiveDoubtSubjects = simulations.filter((s) => s.doubtfulBenefit === "positive");

  if (negativeDoubtSubjects.length > 0) {
    const worst = negativeDoubtSubjects.sort((a, b) => a.doubtful.netPercentageImpact - b.doubtful.netPercentageImpact)[0];
    topRecommendation = `بیشترین آسیب نمره منفی ناشی از شک در درس «${worst.subject}» بوده است (${formatSignedPercentString(worst.doubtful.netPercentageImpact, false)}). در این درس تا اطمینان نیافته‌اید گزینه علامت نزنید.`;
  } else if (positiveDoubtSubjects.length > 0) {
    const best = positiveDoubtSubjects.sort((a, b) => b.doubtful.netPercentageImpact - a.doubtful.netPercentageImpact)[0];
    topRecommendation = `در درس «${best.subject}» پاسخ به سؤالات شک‌دار بهترین بازدهی را داشته است (${formatSignedPercentString(best.doubtful.netPercentageImpact, true)} سود). به شهود خود در این درس اعتماد کنید.`;
  } else {
    topRecommendation = "با ثبت گزینه‌های شک‌دار و حدسی در حین آزمون، سامانه استراتژی بهینه نمره منفی را برای هر درس به شما پیشنهاد می‌دهد.";
  }

  return {
    subjects: simulations,
    totals: {
      totalAttempts,
      totalCorrect,
      totalWrong,
      overallActualPercentage,
      overallWithoutDoubt,
      overallWithoutGuess,
      overallOnlySure,
      totalDoubtfulNetGain: roundTo1(overallActualPercentage - overallWithoutDoubt),
      totalGuessNetGain: roundTo1(overallActualPercentage - overallWithoutGuess),
    },
    topRecommendation,
  };
}
