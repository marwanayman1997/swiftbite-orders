export function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export function fromMinor(amountMinor: number): number {
  return amountMinor / 100;
}

export function sumMinor(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}
