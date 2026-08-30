import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../all-exceptions.filter';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url: '/some/path' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

function makePrismaError(code: string, message = 'Prisma error'): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '6.10.1',
  });
}

describe('AllExceptionsFilter', () => {
  let logger: { error: jest.Mock };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = { error: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as Logger);
  });

  it('maps a NestJS HttpException to its own status and message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('Bad input'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST, message: 'Bad input', path: '/some/path' }),
    );
  });

  it('maps Prisma P2002 (unique violation) to 409 with a stable error code', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2002'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'UNIQUE_CONSTRAINT' }));
  });

  it('maps Prisma P2025 (record not found) to 404', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2025'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'NOT_FOUND' }));
  });

  it('maps Prisma P2034 (transaction conflict) to 409 so the client knows to retry', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2034'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'TRANSACTION_CONFLICT' }));
  });

  it('maps Prisma P2023 (invalid data format) to 400', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2023'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'INVALID_DATA' }));
  });

  it('logs and returns a generic 500 for an unrecognized Prisma error code — never leaks internals', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P9999'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps Prisma validation errors to 400, not 500', () => {
    const { host, status, json } = makeHost();
    const error = new Prisma.PrismaClientValidationError('bad shape', { clientVersion: '6.10.1' });
    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }));
  });

  it('never leaks a raw unrecognized exception message to the client, but does log it', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('database password is hunter2'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const [[payload]] = json.mock.calls;
    expect(payload.message).not.toContain('hunter2');
    expect(logger.error).toHaveBeenCalled();
  });
});
