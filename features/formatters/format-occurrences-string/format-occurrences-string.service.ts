import {
  type FormatOccurrencesStringRequest,
  type FormatOccurrencesStringResult,
} from "./format-occurrences-string.types.js";
import {
  formatFullDate,
  formatMonthYear,
} from "./format-occurrences-string.utils.js";

export function formatOccurrencesString(
  input: FormatOccurrencesStringRequest,
): FormatOccurrencesStringResult {
  const ocurrencesByEmployer: {
    employer: string;
    competence: string;
    type: string;
    startDate: string;
    endDate: string;
  }[] = [];

  input.map(({ values }) => {
    if (values) {
      ocurrencesByEmployer.push({
        employer: values["0"],
        competence: formatMonthYear(values["1"]),
        type: values["2"],
        startDate: formatFullDate(values["3"]),
        endDate: formatFullDate(values["4"]),
      });
    }
  });

  if (ocurrencesByEmployer.length === 0) {
    return { text: "" };
  }

  const lines = ocurrencesByEmployer.map(
    ({ type, startDate, endDate }, index) =>
      `${index + 1}. ${type}: de ${startDate} até ${endDate}`,
  );

  const response = { text: ["Ocorrências do Mês:", "", ...lines].join("\n") };

  return response;
}
