import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new customer account' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const { userId, familyId, rawToken } = await this.authService.register(dto);
    const user = (await this.authService.getUserById(userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: userId,
      email: user.email,
      role: user.role,
      familyId,
    });

    this.setCookies(res, accessToken, rawToken);
    return { user: { id: user.id, email: user.email, role: user.role } };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const { userId, role, familyId, rawToken } = await this.authService.login(dto);
    const user = (await this.authService.getUserById(userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: userId,
      email: user.email,
      role,
      familyId,
    });

    this.setCookies(res, accessToken, rawToken);
    return { user: { id: user.id, email: user.email, role: user.role } };
  }

  @Post('refresh')
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
      // Another tab already refreshed within the grace period.
      // Return a 409 so the client knows to retry with existing cookies.
      res.status(HttpStatus.CONFLICT);
      throw new UnauthorizedException('REFRESH_RECENTLY_ROTATED');
    }

    const user = (await this.authService.getUserById(outcome.userId))!;
    const accessToken = this.authService.signAccessToken({
      sub: outcome.userId,
      email: user.email,
      role: user.role,
      familyId: outcome.familyId,
    });

    this.setCookies(res, accessToken, outcome.newRawToken);
    return { user: { id: user.id, email: user.email, role: user.role } };
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
    return { user: { id: dbUser.id, email: dbUser.email, role: dbUser.role } };
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
