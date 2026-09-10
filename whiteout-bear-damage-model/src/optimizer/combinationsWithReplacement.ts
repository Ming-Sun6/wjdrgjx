/**
 * 生成允许重复、忽略顺序的固定长度组合。
 * items 应由调用方保证身份唯一；结果中的索引始终非递减，因此不会产生排列重复。
 */
export function combinationsWithReplacement<T>(
  items: readonly T[],
  count: number,
): T[][] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("组合长度必须是非负安全整数。");
  }

  if (count === 0) {
    return [[]];
  }

  if (items.length === 0) {
    return [];
  }

  const combinations: T[][] = [];
  const current: T[] = [];

  function visit(startIndex: number): void {
    if (current.length === count) {
      combinations.push([...current]);
      return;
    }

    for (let index = startIndex; index < items.length; index += 1) {
      current.push(items[index]!);
      visit(index);
      current.pop();
    }
  }

  visit(0);
  return combinations;
}

/** 无序可重复组合，并限制每个输入元素在单个组合中的最大出现次数。 */
export function combinationsWithReplacementLimited<T>(
  items: readonly T[],
  count: number,
  maxCopiesPerItem: number,
): T[][] {
  if (!Number.isSafeInteger(maxCopiesPerItem) || maxCopiesPerItem <= 0) {
    throw new RangeError("每项最大重复数必须是正安全整数。");
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("组合长度必须是非负安全整数。");
  }
  if (count === 0) return [[]];
  const results: T[][] = [];
  const current: T[] = [];
  function visit(startIndex: number): void {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let index = startIndex; index < items.length; index += 1) {
      let copies = 0;
      for (let cursor = current.length - 1; cursor >= 0; cursor -= 1) {
        if (current[cursor] !== items[index]) break;
        copies += 1;
      }
      if (copies >= maxCopiesPerItem) continue;
      current.push(items[index]!);
      visit(index);
      current.pop();
    }
  }
  visit(0);
  return results;
}
