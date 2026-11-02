/** Keep scalar selections compatible with existing report callers. */
export type FilterSelection = string | readonly string[];

export function selectedFilterValues(selection: FilterSelection): readonly string[] {
  return selection === "all" ? [] : typeof selection === "string" ? [selection] : selection;
}

export function matchesFilterValue(selection: FilterSelection, value: string): boolean {
  return selection === "all" || (typeof selection === "string" ? selection === value : selection.includes(value));
}

export function isFilterSelected(selection: FilterSelection, value: string): boolean {
  return value === "all" ? selection === "all" : selection !== "all" && matchesFilterValue(selection, value);
}

function compactSelection(values: readonly string[]): FilterSelection {
  return values.length === 0 ? "all" : values.length === 1 ? values[0] : values;
}

export function toggleFilterSelection(selection: FilterSelection, value: string): FilterSelection {
  if (value === "all") return "all";
  const values = selectedFilterValues(selection);
  return compactSelection(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
}

/** Drop only unavailable values; keep the reference when nothing changed. */
export function retainFilterSelection(selection: FilterSelection, allowed: ReadonlySet<string>): FilterSelection {
  if (selection === "all") return selection;
  const values = selectedFilterValues(selection);
  const retained = values.filter((value) => allowed.has(value));
  return retained.length === values.length ? selection : compactSelection(retained);
}
