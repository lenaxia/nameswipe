export type ClassValue = string | false | null | undefined;

/** Join conditional class names; falsy values are dropped. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
