import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Delete,
  Res,
  Req,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SessionDto } from './dto/session.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function deviceContext(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // `register`/`login`/`refresh` are the credential-guessing and
  // account-enumeration surface — throttled far tighter than the global
  // default (`app.throttleLimit`/min, applied everywhere else) via a static
  // per-route `@Throttle()` override. Decorator arguments are evaluated at
  // class-definition time, so these are fixed values rather than sourced
  // from injected config (which only exists per-instance, after DI runs).

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new customer account' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { userId, familyId, rawToken } = await this.authService.register(dto, deviceContext(req));
    const user = (await this.authService.getUserById(userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: userId,
      email: user.email,
      role: user.role,
      familyId,
    });

    this.setCookies(res, accessToken, rawToken);
    return { user };
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { userId, role, familyId, rawToken } = await this.authService.login(dto, deviceContext(req));
    const user = (await this.authService.getUserById(userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: userId,
      email: user.email,
      role,
      familyId,
    });

    this.setCookies(res, accessToken, rawToken);
    return { user };
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!rawToken) throw new UnauthorizedException('No refresh token');

    const gracePeriodMs = this.config.get<number>('app.refreshGracePeriodMs', 30000);
    const outcome = await this.authService.refresh(rawToken, gracePeriodMs);

    if (outcome.kind === 'not-found' || outcome.kind === 'expired') {
      this.clearCookies(res);
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    if (outcome.kind === 'family-revoked' || outcome.kind === 'already-revoked') {
      this.clearCookies(res);
      throw new UnauthorizedException('Session has been revoked');
    }

    if (outcome.kind === 'recently-rotated') {
      throw new ConflictException('Another tab already refreshed — retry with existing cookies');
    }

    const user = (await this.authService.getUserById(outcome.userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: outcome.userId,
      email: user.email,
      role: user.role,
      familyId: outcome.familyId,
    });

    this.setCookies(res, accessToken, outcome.newRawToken);
    return { user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Logout current device (revoke current token family)' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(user.sub, user.familyId);
    this.clearCookies(res);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Logout all devices (revoke all token families)' })
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.sub);
    this.clearCookies(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async me(@CurrentUser() user: JwtPayload): Promise<AuthResponseDto> {
    const dbUser = await this.authService.getUserById(user.sub);
    if (!dbUser) throw new UnauthorizedException('User not found');
    return { user: dbUser };
  }

  // ── Email verification ────────────────────────────────────────────────────

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address using the token from the verification link' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ status: 'verified' | 'already-verified' }> {
    const outcome = await this.authService.verifyEmail(dto.token);
    if (outcome === 'invalid') throw new BadRequestException('This verification link is invalid.');
    if (outcome === 'expired') {
      throw new BadRequestException('This verification link has expired. Request a new one.');
    }
    return { status: outcome };
  }

  @Post('resend-verification')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resend the verification email (no-op if already verified or unknown email)' })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.authService.resendVerification(dto.email);
  }

  // ── Password reset ────────────────────────────────────────────────────────

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset email (always responds the same way, to avoid leaking which emails are registered)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.authService.requestPasswordReset(dto.email, req.ip);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset password using the token from the reset-password email; revokes every session' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    const outcome = await this.authService.resetPassword(dto.token, dto.newPassword);
    if (outcome === 'invalid') throw new BadRequestException('This reset link is invalid.');
    if (outcome === 'expired') {
      throw new BadRequestException('This reset link has expired. Request a new one.');
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List active sessions (devices) for the current user' })
  async listSessions(@CurrentUser() user: JwtPayload): Promise<SessionDto[]> {
    return this.authService.listSessions(user.sub, user.familyId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Revoke one session (device) — the current session may be revoked, which logs that device out' })
  async revokeSession(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    await this.authService.revokeSession(user.sub, id);
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = this.config.get<string>('app.nodeEnv') === 'production';
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
      // Domain deliberately omitted for host-only cookie binding
    };

    res.cookie(ACCESS_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private clearCookies(res: Response): void {
    const isProduction = this.config.get<string>('app.nodeEnv') === 'production';
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
    };
    res.clearCookie(ACCESS_COOKIE, cookieOptions);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
  }
}
