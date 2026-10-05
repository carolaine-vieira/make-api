/** Thrown by services for bad input; the endpoint wrapper turns it into a 422 response. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
