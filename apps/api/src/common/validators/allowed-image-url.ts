import { isIP } from 'net';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { resolveApprovedOrigins, originKey } from '@shopnest/media-origins';

export const ALLOWED_IMAGE_ORIGINS: readonly string[] = resolveApprovedOrigins(
  process.env.MEDIA_PUBLIC_BASE_URL,
  `http://localhost:${process.env.PORT ?? '3001'}`,
).map(originKey);

function isIpLiteral(hostname: string): boolean {
  const stripped = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return isIP(stripped) !== 0;
}

export function isAllowedImageUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (isIpLiteral(url.hostname)) return false;

  return ALLOWED_IMAGE_ORIGINS.includes(url.origin);
}

export function IsAllowedImageUrl(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isAllowedImageUrl',
      target: object.constructor,
      propertyName: propertyName as string,
      options: {
        message: `$property must be an https URL on an approved image host (${ALLOWED_IMAGE_ORIGINS.join(', ')})`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => isAllowedImageUrl(value),
      },
    });
  };
}
