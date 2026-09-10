interface DecimalParts {
  readonly coefficient: bigint;
  readonly decimalPlaces: number;
}

export interface CommonDecimalUnits {
  readonly units: readonly bigint[];
  readonly scale: bigint;
  readonly decimalPlaces: number;
}

/** 将有限非负 JS 数字按其十进制字符串精确转换为共同整数单位。 */
export function toCommonDecimalUnits(
  values: readonly number[],
): CommonDecimalUnits {
  const parts = values.map(toDecimalParts);
  const decimalPlaces = parts.reduce(
    (maximum, part) => Math.max(maximum, part.decimalPlaces),
    0,
  );
  const scale = powerOfTen(decimalPlaces);
  const units = parts.map(
    (part) =>
      part.coefficient * powerOfTen(decimalPlaces - part.decimalPlaces),
  );

  return { units, scale, decimalPlaces };
}

export function decimalUnitsToNumber(
  units: bigint,
  decimalPlaces: number,
): number {
  if (decimalPlaces === 0) {
    return Number(units);
  }

  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(
    decimalPlaces + 1,
    "0",
  );
  const splitAt = digits.length - decimalPlaces;
  const text = `${negative ? "-" : ""}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;

  return Number(text);
}

function toDecimalParts(value: number): DecimalParts {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`只能转换有限非负数，收到：${value}。`);
  }

  const [mantissa = "0", exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [integerPart = "0", fractionalPart = ""] = mantissa.split(".");
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  let coefficient = BigInt(digits || "0");
  let decimalPlaces = fractionalPart.length - exponent;

  if (decimalPlaces < 0) {
    coefficient *= powerOfTen(-decimalPlaces);
    decimalPlaces = 0;
  }

  return { coefficient, decimalPlaces };
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
