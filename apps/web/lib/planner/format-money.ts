const number = (n: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(n);
export function formatMoney(amount: number, currency: "SEED" | "ELSO") {
  const value =
    amount >= 1e12
      ? `${number(amount / 1e12)}兆`
      : amount >= 1e8
        ? `${number(amount / 1e8)}億`
        : amount >= 1e4
          ? `${number(amount / 1e4)}万`
          : number(Math.round(amount));
  return `${value} ${currency}`;
}
