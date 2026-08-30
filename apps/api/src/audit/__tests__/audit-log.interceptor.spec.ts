import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AuditLogInterceptor } from '../audit-log.interceptor';
import { AuditLogService } from '../audit-log.service';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeHandler(response: unknown): CallHandler {
  return { handle: () => of(response) };
}

describe('AuditLogInterceptor', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let auditLog: { record: jest.Mock };
  let interceptor: AuditLogInterceptor;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditLogInterceptor(
      reflector as unknown as Reflector,
      auditLog as unknown as AuditLogService,
    );
  });

  it('is a no-op (never calls record) on a route without @Audit()', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({ params: {}, body: {} });

    interceptor.intercept(context, makeHandler({ id: 'x' })).subscribe(() => {
      expect(auditLog.record).not.toHaveBeenCalled();
      done();
    });
  });

  it('resolves the target id from route params by default (param:id)', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_PRODUCT_UPDATE', targetType: 'Product' });
    const context = makeContext({
      params: { id: 'prod-1' },
      body: { name: 'New name' },
      user: { sub: 'admin-1' },
      ip: '203.0.113.1',
    });

    interceptor.intercept(context, makeHandler({ id: 'prod-1', name: 'New name' })).subscribe(() => {
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'ADMIN_PRODUCT_UPDATE',
          targetType: 'Product',
          targetId: 'prod-1',
          ipAddress: '203.0.113.1',
        }),
      );
      done();
    });
  });

  it('resolves the target id from the response body for idSource: body:id (create routes)', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'ADMIN_CATEGORY_CREATE',
      targetType: 'Category',
      idSource: 'body:id',
    });
    const context = makeContext({ params: {}, body: { name: 'Electronics' }, user: { sub: 'admin-1' } });

    interceptor.intercept(context, makeHandler({ id: 'cat-9', name: 'Electronics' })).subscribe(() => {
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'cat-9' }));
      done();
    });
  });

  it('also finds body:id inside a { data, timestamp } response envelope', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'ADMIN_CATEGORY_CREATE',
      targetType: 'Category',
      idSource: 'body:id',
    });
    const context = makeContext({ params: {}, body: {}, user: { sub: 'admin-1' } });

    interceptor
      .intercept(context, makeHandler({ data: { id: 'cat-wrapped' }, timestamp: 'now' }))
      .subscribe(() => {
        expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'cat-wrapped' }));
        done();
      });
  });

  it('never writes an audit row if no id can be resolved at all', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_CATEGORY_DELETE', targetType: 'Category' });
    const context = makeContext({ params: {}, body: {} });

    interceptor.intercept(context, makeHandler(undefined)).subscribe(() => {
      expect(auditLog.record).not.toHaveBeenCalled();
      done();
    });
  });

  it('redacts password/passwordHash from the persisted metadata', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: { status: 'SUSPENDED', password: 'should-never-be-logged' },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(call.metadata).toEqual({ status: 'SUSPENDED' });
      done();
    });
  });

  it('redacts any body key matching password/token/secret/hash, case-insensitively', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: {
        status: 'SUSPENDED',
        newPassword: 'x',
        resetToken: 'y',
        apiSecret: 'z',
        passwordHash: 'w',
        note: 'kept',
      },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(call.metadata).toEqual({ status: 'SUSPENDED', note: 'kept' });
      done();
    });
  });

  it('redacts a matching key nested inside a plain object, at any depth', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: { status: 'SUSPENDED', profile: { name: 'Jane', credentials: { password: 'x', apiToken: 'y' } } },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(call.metadata).toEqual({ status: 'SUSPENDED', profile: { name: 'Jane', credentials: {} } });
      done();
    });
  });

  it('redacts matching keys inside array elements', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: { items: [{ name: 'a', secret: 'x' }, { name: 'b', token: 'y' }] },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(call.metadata).toEqual({ items: [{ name: 'a' }, { name: 'b' }] });
      done();
    });
  });

  it('passes through null, numbers, booleans, and arrays of primitives unchanged', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: { note: null, count: 3, active: true, tags: ['a', 'b', 3] },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(call.metadata).toEqual({ note: null, count: 3, active: true, tags: ['a', 'b', 3] });
      done();
    });
  });

  it('caps recursion depth on deeply nested hostile input instead of crashing', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    let deep: Record<string, unknown> = { password: 'leaf' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    const context = makeContext({ params: { id: 'user-1' }, body: deep, user: { sub: 'admin-1' } });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0];
      expect(JSON.stringify(call.metadata)).toContain('max depth exceeded');
      expect(JSON.stringify(call.metadata)).not.toContain('leaf');
      done();
    });
  });

  it('caps array length on an oversized array instead of persisting all of it', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const context = makeContext({
      params: { id: 'user-1' },
      body: { items: Array.from({ length: 500 }, (_, i) => i) },
      user: { sub: 'admin-1' },
    });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      const call = auditLog.record.mock.calls[0][0] as { metadata: { items: unknown[] } };
      expect(call.metadata.items.length).toBeLessThan(500);
      done();
    });
  });

  it('does not hang or throw on a circular structure', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const circular: Record<string, unknown> = { name: 'x' };
    circular.self = circular;
    const context = makeContext({ params: { id: 'user-1' }, body: circular, user: { sub: 'admin-1' } });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      expect(auditLog.record).toHaveBeenCalled();
      done();
    });
  });

  it('never mutates the original request body', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_USER_SUSPEND', targetType: 'User' });
    const body = { status: 'SUSPENDED', nested: { password: 'x', kept: 'y' } };
    const context = makeContext({ params: { id: 'user-1' }, body, user: { sub: 'admin-1' } });

    interceptor.intercept(context, makeHandler({ id: 'user-1' })).subscribe(() => {
      expect(body).toEqual({ status: 'SUSPENDED', nested: { password: 'x', kept: 'y' } });
      done();
    });
  });

  it('never calls record() when the handler throws — no misleading "this happened" row', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ action: 'ADMIN_PRODUCT_UPDATE', targetType: 'Product' });
    const context = makeContext({ params: { id: 'prod-1' }, body: {}, user: { sub: 'admin-1' } });
    const handler: CallHandler = { handle: () => throwError(() => new Error('downstream failure')) };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(auditLog.record).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
