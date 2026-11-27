export function normalizeGtin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))
    return undefined;
  // Restricted-distribution/variable-weight retailer codes are not global identifiers.
  if (value.startsWith('2')) return undefined;
  const digits = value.padStart(14, '0');
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0,
  );
  return sum % 10 === 0 ? digits : undefined;
}
