const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string | number): Date {
  if (typeof value === 'string') {
    const match = DATE_ONLY_PATTERN.exec(value);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  return new Date(value);
}

export function formatEntryDate(value: string | number): string {
  return parseLocalDate(value).toLocaleDateString();
}
