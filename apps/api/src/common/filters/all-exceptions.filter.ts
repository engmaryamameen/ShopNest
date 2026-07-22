import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as { message?: string }).message ?? message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists';
        errorCode = 'UNIQUE_CONSTRAINT';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
        errorCode = 'NOT_FOUND';
      } else if (exception.code === 'P2034') {
        status = HttpStatus.CONFLICT;
        message = 'Transaction conflict — retry with the same idempotency key';
        errorCode = 'TRANSACTION_CONFLICT';
      } else if (exception.code === 'P2023') {
        // Inconsistent column data — e.g. a non-UUID string passed to a UUID column
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid data format';
        errorCode = 'INVALID_DATA';
      } else {
        this.logger.error({ err: exception }, 'Unhandled Prisma error');
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Missing required fields, wrong types, or invalid enum values passed
      // to a Prisma query — always a caller mistake, not a server error.
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid request data';
      errorCode = 'VALIDATION_ERROR';
    } else {
      this.logger.error({ err: exception, path: request.url }, 'Unhandled exception');
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errorCode ? { errorCode } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
