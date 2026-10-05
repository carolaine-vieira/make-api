import { defineEndpoint } from '../../../shared/define-endpoint.js';
import { formatOccurrencesString } from './format-occurrences-string.service.js';
import type { FormatOccurrencesStringRequest } from './format-occurrences-string.types.js';

export const formatOccurrencesStringController = defineEndpoint({
  method: 'POST',
  summary: 'Format occurrences into a string',
  description:
    'Receives rows from Excel (name, competence, type, start and end dates as Excel serial dates) and returns a numbered list of occurrences. Returns an empty string when there are none.',
  example: [
    { values: { 0: 'Carolaine', 1: 46296, 2: 'Férias', 3: 46303, 4: 46307 } },
    { values: { 0: 'Carolaine', 1: 46296, 2: 'Folga', 3: 46311, 4: 46311 } },
  ],
  handle: (input: FormatOccurrencesStringRequest) => formatOccurrencesString(input),
});
