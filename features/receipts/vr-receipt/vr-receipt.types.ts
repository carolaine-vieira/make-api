export interface IssueDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** Validated and normalized data used to render the receipt. */
export interface ReceiptData {
  name: string;
  /** Formatted as 000.000.000-00. */
  cpf: string;
  unitValue: number;
  quantity: number;
  totalValue: number;
  totalInWords: string;
  referenceMonth: string;
  issueDate: IssueDate;
  observation?: string;
  fileName?: string;
}

export interface FieldIssue {
  field: string;
  message: string;
}
