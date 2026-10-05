/** Excel row keyed by column index: employer, competence, type, start date, end date. */
export interface OccurrenceValues {
  "0": string;
  /** Excel serial date. */
  "1": number;
  "2": string;
  /** Excel serial date. */
  "3": number;
  /** Excel serial date. */
  "4": number;
}

export interface OccurrenceRow {
  values?: OccurrenceValues;
}

export type FormatOccurrencesStringRequest = OccurrenceRow[];

export interface FormatOccurrencesStringResult {
  text: string;
}

export { ValidationError } from "../../../shared/errors.js";
