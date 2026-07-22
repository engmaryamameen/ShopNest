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
      } else {
        this.logger.error({ err: exception }, 'Unhandled Prisma error');
      }
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
